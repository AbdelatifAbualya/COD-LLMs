// Vercel Serverless Function for Abacus.AI Web Search Agent
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Log function invocation
  console.log("Abacus.AI Web Search Agent called:", new Date().toISOString());
  
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
    // Get ALL needed API credentials from environment variables
    const DEPLOYMENT_TOKEN = process.env.ABACUS_WEBSEARCH_TOKEN;
    const DEPLOYMENT_ID = process.env.ABACUS_WEBSEARCH_ID;
    
    console.log("Environment check: ABACUS_WEBSEARCH_TOKEN exists?", !!DEPLOYMENT_TOKEN);
    console.log("Environment check: ABACUS_WEBSEARCH_ID exists?", !!DEPLOYMENT_ID);
    
    if (!DEPLOYMENT_TOKEN || !DEPLOYMENT_ID) {
      console.error("ERROR: Abacus.AI Web Search credentials are missing in environment variables");
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({
        error: 'Abacus.AI Web Search credentials not configured',
        message: 'Please set ABACUS_WEBSEARCH_TOKEN and ABACUS_WEBSEARCH_ID in your Vercel environment variables'
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
    
    console.log(`Web search query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);

    try {
      // Use Abacus.AI API endpoint for deployments
      const abacusAPIUrl = "https://api.abacus.ai/api/v0/deployment/predict";
      
      const payload = {
        deploymentId: DEPLOYMENT_ID,
        input: {
          query: query
        }
      };
      
      console.log("Sending request to Abacus.AI Web Search API...");
      
      // Set a timeout for the request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      // Make the API call to Abacus.AI
      const response = await fetch(abacusAPIUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEPLOYMENT_TOKEN}`
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
      console.log("Abacus.AI Web Search API response received successfully");
      
      // Format the search results
      const searchResults = data.output?.search_output || "No search results found.";
      
      // Return processed response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).json({ 
        search_results: searchResults,
        success: true
      });
      
    } catch (fetchError) {
      // Check if this is an abort error (timeout)
      if (fetchError.name === 'AbortError') {
        console.error("Request timed out after 30 seconds");
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(504).json({ 
          error: 'Gateway Timeout', 
          message: 'The web search request took too long to complete (>30 seconds). Try a more specific search query.'
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
