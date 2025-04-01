// Vercel Edge Function for Streaming API Responses
export default async function handler(request, context) {
  // Log function invocation
  console.log("Streaming Edge API called:", new Date().toISOString());

  // Handle CORS for preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Allow': 'POST'
        }
      }
    );
  }

  try {
    // Get the Fireworks API key from environment variables
    const apiKey = process.env.FIREWORKS_API_KEY;
    
    if (!apiKey) {
      console.error("ERROR: Fireworks API key is missing in environment variables");
      return new Response(
        JSON.stringify({
          error: 'API key not configured',
          message: 'Please set FIREWORKS_API_KEY in your Vercel environment variables'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON in request body',
          message: parseError.message
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Log request information
    const modelName = requestBody.model || 'unknown';
    console.log('Streaming request received for model:', modelName);
    
    // Enable streaming if not explicitly set
    if (requestBody.stream === undefined) {
      requestBody.stream = true;
    }
    
    // Prepare request for Fireworks API
    const apiEndpoint = 'https://api.fireworks.ai/inference/v1/chat/completions';
    
    // Validate max_tokens (Fireworks models accept different limits based on model)
    const originalMaxTokens = requestBody.max_tokens || 4096;
    const validatedMaxTokens = Math.min(Math.max(1, originalMaxTokens), 8192);
    
    if (originalMaxTokens !== validatedMaxTokens) {
      console.log(`Adjusted max_tokens from ${originalMaxTokens} to ${validatedMaxTokens}`);
    }
    
    const cleanedParams = {
      model: requestBody.model,
      messages: requestBody.messages,
      max_tokens: validatedMaxTokens,
      temperature: requestBody.temperature,
      top_p: requestBody.top_p,
      stream: true  // Force streaming mode
    };

    // Remove undefined or null values
    Object.keys(cleanedParams).forEach(key => {
      if (cleanedParams[key] === undefined || cleanedParams[key] === null) {
        delete cleanedParams[key];
      }
    });
    
    // Set up the Fireworks API request
    const apiRequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(cleanedParams)
    };
    
    // Call the Fireworks API
    const apiResponse = await fetch(apiEndpoint, apiRequestOptions);
    
    if (!apiResponse.ok) {
      let errorMessage = `API Error: ${apiResponse.status}`;
      try {
        const errorText = await apiResponse.text();
        errorMessage = errorText || errorMessage;
      } catch (e) {
        console.error('Error parsing error response:', e);
      }

      return new Response(
        JSON.stringify({ 
          error: true, 
          message: errorMessage
        }),
        {
          status: apiResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // Transform the response into a readable stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Process the API response stream
    const apiStream = apiResponse.body;
    const reader = apiStream.getReader();
    
    // Function to process and forward each chunk
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Signal the end of the stream
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            await writer.close();
            return;
          }
          
          // Forward the chunk directly
          await writer.write(value);
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        // Send error message in SSE format
        await writer.write(encoder.encode(`data: ${JSON.stringify({error: true, message: error.message})}\n\n`));
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
      }
    };
    
    // Start processing the stream
    pump();
    
    // Return the transformed stream as the response
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Function error:', error.name, error.message);
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: {
          name: error.name,
          message: error.message
        }
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
