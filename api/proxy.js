// Vercel Serverless Function for Fireworks.ai API Proxy
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Log function invocation
  console.log("Fireworks API proxy called:", new Date().toISOString());
  
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // Get API key from environment variable
    const API_KEY = process.env.FIREWORKS_API_KEY;
    console.log("Environment check: FIREWORKS_API_KEY exists?", !!API_KEY);
    
    if (!API_KEY) {
      console.log("ERROR: API key is missing");
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({ error: 'API key not configured on server' });
      return;
    }

    // Parse the request body
    let requestBody;
    try {
      requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const modelName = requestBody.model || 'not specified';
      console.log(`Model requested: ${modelName}`);
      
      // Extract thread ID for improved context isolation
      const threadId = requestBody.threadId || requestBody.user || `thread-${Date.now()}`;
      
      // Add timing metrics for monitoring CoD vs CoT performance
      let reasoningMethod = 'Standard';
      if (requestBody.messages && requestBody.messages[0] && requestBody.messages[0].content) {
        const systemPrompt = requestBody.messages[0].content;
        if (systemPrompt.includes('Chain of Draft')) {
          reasoningMethod = 'CoD';
        } else if (systemPrompt.includes('Chain of Thought')) {
          reasoningMethod = 'CoT';
        }
      }
      
      console.log(`Using reasoning method: ${reasoningMethod}`);
      console.log(`Request complexity: ${JSON.stringify({
        messages_count: requestBody.messages ? requestBody.messages.length : 0,
        max_tokens: requestBody.max_tokens || 'default',
        thread_id: threadId
      })}`);
      
      const startTime = Date.now();

      // Configure fetch timeout to 120 seconds (Vercel's maximum)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log("Request is taking too long, aborting...");
        controller.abort();
      }, 120000);
      
      try {
        // Validate max_tokens before sending to API
        const originalMaxTokens = requestBody.max_tokens || 4096;
        const validatedMaxTokens = Math.min(Math.max(1, originalMaxTokens), 8192);
        
        if (originalMaxTokens !== validatedMaxTokens) {
          console.log(`Adjusted max_tokens from ${originalMaxTokens} to ${validatedMaxTokens} to meet API requirements`);
        }
        
        // Create modified request body with validated parameters
        const modifiedRequestBody = {
          ...requestBody,
          max_tokens: validatedMaxTokens,
          user: threadId // Adding thread ID for session isolation
        };
        
        // Special handling for "reset" conversations
        if (req.query && req.query.reset === 'true') {
          console.log("Handling context reset request for thread:", threadId);
        }
        
        // Forward the request to Fireworks.ai with timeout
        const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
          },
          body: JSON.stringify(modifiedRequestBody),
          signal: controller.signal
        });

        // Clear the timeout
        clearTimeout(timeoutId);

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        console.log(`Fireworks API response status: ${response.status}, time: ${responseTime}ms, method: ${reasoningMethod}`);
        
        // Check if response is ok
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error (${response.status}): ${errorText}`);
          
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.status(response.status).json({ 
            error: `API Error: ${response.statusText}`, 
            details: errorText
          });
          return;
        }
        
        // Get the response data
        const data = await response.json();
        
        // Log token usage if available
        if (data.usage) {
          console.log(`Token usage for thread ${threadId}:`, {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens
          });
        }
        
        // Add performance metrics to response
        if (data && !data.error) {
          data.performance = {
            response_time_ms: responseTime,
            reasoning_method: reasoningMethod,
            thread_id: threadId
          };
        }
        
        // Return the response from Fireworks.ai
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).json(data);
        
      } catch (fetchError) {
        // Clear the timeout
        clearTimeout(timeoutId);
        
        // Check if this is an abort error (timeout)
        if (fetchError.name === 'AbortError') {
          console.error("Request timed out after 120 seconds");
          
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.status(504).json({ 
            error: 'Gateway Timeout', 
            message: 'The request to the LLM API took too long to complete (>120 seconds). Try reducing complexity or using fewer tokens.'
          });
          return;
        }
        
        console.error("Error in fetch:", fetchError);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(500).json({ 
          error: 'Request Failed', 
          message: fetchError.message 
        });
      }
    } catch (parseError) {
      console.error("Error parsing request:", parseError);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Error processing request: ' + parseError.message
      });
    }
  } catch (error) {
    console.error('Function error:', error.message, error.stack);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message
    });
  }
};
