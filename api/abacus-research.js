// Vercel Serverless Function for Abacus.AI Research Agent
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Log function invocation
  console.log("Abacus.AI Research Agent called:", new Date().toISOString());
  
  // Handle CORS for preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
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
    // Get API key and deployment token from environment variables
    const DEPLOYMENT_TOKEN = process.env.ABACUS_DEPLOYMENT_TOKEN;
    const DEPLOYMENT_ID = process.env.ABACUS_DEPLOYMENT_ID;
    
    console.log("Environment check: ABACUS_DEPLOYMENT_TOKEN exists?", !!DEPLOYMENT_TOKEN);
    console.log("Environment check: ABACUS_DEPLOYMENT_ID exists?", !!DEPLOYMENT_ID);
    
    if (!DEPLOYMENT_TOKEN || !DEPLOYMENT_ID) {
      console.error("ERROR: Abacus.AI credentials are missing in environment variables");
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({
        error: 'Abacus.AI credentials not configured',
        message: 'Please set ABACUS_DEPLOYMENT_TOKEN and ABACUS_DEPLOYMENT_ID in your Vercel environment variables'
      });
      return;
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(400).json({
        error: 'Invalid JSON in request body',
        message: parseError.message
      });
      return;
    }

    // Validate the query parameter
    if (!requestBody.query) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(400).json({ error: 'Missing required parameter: query' });
      return;
    }

    const query = requestBody.query;
    const email = requestBody.email || null;
    
    console.log(`Research query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
    console.log(`Email provided: ${email ? 'Yes' : 'No'}`);

    try {
      // Use Abacus.AI API client directly for simplicity
      const abacusAPIUrl = "https://api.abacus.ai/api";
      
      // Prepare the keyword arguments
      const keywordArgs = {
        subject: query
      };
      
      if (email) {
        keywordArgs.email = email;
      }
      
      const payload = {
        deployment_token: DEPLOYMENT_TOKEN,
        deployment_id: DEPLOYMENT_ID,
        keyword_arguments: keywordArgs
      };
      
      console.log("Sending request to Abacus.AI API...");
      
      // Set a timeout for the request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout
      
      // Make the API call to Abacus.AI
      const response = await fetch(`${abacusAPIUrl}/agents/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      // Check if response is ok
      if (!response.ok) {
        let errorText = await response.text();
        console.error(`Abacus.AI API error (${response.status}): ${errorText}`);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status).json({ 
          error: `Abacus.AI API Error: ${response.statusText}`, 
          details: errorText
        });
        return;
      }
      
      // Parse the response data
      const data = await response.json();
      console.log("Abacus.AI API response received successfully");
      
      // Format the research papers data for the chatbot
      // Note: This assumes the agent returns data in the format specified in your example
      const researchPapers = data.research_papers || "No research papers found.";
      
      // Return processed response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).json({ 
        research_papers: researchPapers,
        success: true
      });
      
    } catch (fetchError) {
      // Check if this is an abort error (timeout)
      if (fetchError.name === 'AbortError') {
        console.error("Request timed out after 3 minutes");
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(504).json({ 
          error: 'Gateway Timeout', 
          message: 'The research agent request took too long to complete (>3 minutes). Try a more specific research query.'
        });
        return;
      }
      
      // Handle other fetch errors
      console.error("Fetch error:", fetchError);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({ 
        error: 'Request Failed', 
        message: fetchError.message
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
