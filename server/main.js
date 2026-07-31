import express from 'express';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { mcpServer } from './mcpServer.js';
import cors from 'cors';
import {z} from "zod";
import Groq from 'groq-sdk';
import {zodToJsonSchema} from "zod-to-json-schema";
import {runFullAudioAuditTool} from "./Tools/run_full_audio_audit.js";
import {fetchHistoricalAuditTool} from "./Tools/fetch_historical_audit.js";
import { pipelineProgress } from './services/progressEmitter.js';

const app = express();
let transport;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Middleware

// 1. Enable connection to the React client (frontend) without Cross-Origin Resource Sharing (CORS) issues
app.use(cors({ origin: 'http://localhost:3000'}))
// 2. Allow the incoming network requests to be parsed as JSON
app.use(express.json())


// GET / - returns status of the MCP server
app.get('/', (request, response) => {
    response.json({
        status: 'online',
        service: 'qa-auditor-mcp-server',
        timestamp: new Date().toISOString()
    });
});

// GET /sse - establish and connect to the SSE transport layer
app.get('/sse', async (request, response) => {
    transport = new SSEServerTransport('/messages', response);
    await mcpServer.connect(transport);
    console.log("SSE connection established with client.\n");
});

// POST /messages - sends the messages (user-prompts) from frontend to backend (MCP Server) via SSE Transport layer
app.post('/messages', async (request, response) => {
    if(!transport) {
        response.status(400).send('SSE connection not established yet');
        return;
    }
    await transport.handlePostMessage(request, response);
});

// POST /api/orchestrate
app.post('/api/orchestrate', async (request, response) => {
    // handle incoming POST network requests containing user prompts, possibly links to the audio file

    // 1. get prompt
    const { prompt } = request.body;
    if(!prompt) {
        return response.status(400).json({ error: "Prompt is required" });
    }

    // Helper function to format tools and strip out the offending "$schema" key causing runtime errors
    const formatToolForGroq = (tool) => {
        const jsonSchema = zodToJsonSchema(z.object(tool.schema));
        delete jsonSchema.$schema; // Clean up the schema for Groq

        return {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: jsonSchema
            }
        };
    };

    // 2. Construct the array of tools formatted strictly for Groq/OpenAI
    const mcpTools = [
        formatToolForGroq(runFullAudioAuditTool),
        formatToolForGroq(fetchHistoricalAuditTool)
    ];

    // Create a map to easily look up the actual tool logic by name
    const toolHandlers = {
        [runFullAudioAuditTool.name]: runFullAudioAuditTool,
        [fetchHistoricalAuditTool.name]: fetchHistoricalAuditTool
    };

    try {
        // 3. First LLM call to pass userPrompt to the LLM
        const messages = [
            {
                role: "system",
                content: "You are an intelligent router for a QA auditing system. Use the provided tools to fetch data or run audits based on the user's request. When summarizing data from a tool, you must use clean Markdown formatting. Use bolding for key terms, line breaks between distinct records, and bullet points for readability. Never output a dense wall of text."
            },
            {
                role: "user",
                content: prompt
            }
        ];

        const llmResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: messages,
            tools: mcpTools,
            tool_choice: "auto"
        });

        // 🚨 DEBUG: Let's see exactly what Groq handed back
        console.log("RAW GROQ RESPONSE:\n", JSON.stringify(llmResponse, null, 2));

        // Defensive check to prevent the server from crashing
        if (!llmResponse.choices || llmResponse.choices.length === 0) {
            console.error("Groq returned an unexpected payload format.");
            return response.status(500).json({ error: "Received an empty or invalid response from Groq." });
        }

        const responseMessage = llmResponse.choices[0].message;
        const toolCalls = responseMessage.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
            // LLM needs to use and execute an MCP tool
            const toolCall = toolCalls[0];
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            console.log(`\n🤖 Llama chose tool: ${toolName}`);
            console.log(`📦 With arguments:`, toolArgs);

            // ====== Execute the selected/called tool ======
            const selectedTool = toolHandlers[toolName];

            if(!selectedTool) {
                return response.json({ error: `LLM requested unknown tool - ${toolName}` });
            }

            console.log(`⏳ Executing tool ${toolName}...\n`);
            const toolResult = await selectedTool.handler(toolArgs);

            if(toolResult.isError) {
                console.log("‼️Tool execution failed!\n")
                return response.status(500).json({ error: toolResult.content[0]?.text });
            }
            console.log("✅ Tool execution complete!\n");

            // 2nd LLM call to summarise a report (if tool execution was successful)
            console.log("Synthesizing final report....\n");
            // Add the LLM's tool call request
            messages.push(responseMessage);
            // Add the tool execution's actual output
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(toolResult)
            });

            // 2n LLM call with updated history
            const finalResponse = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                temperature: 0.1,
                messages: messages
                // Don't pass the tools list because here, we only want the summary of the audit report
            })

            const finalSummary = finalResponse.choices[0].message.content
            if(!finalSummary) {
                console.log()
            }

            // Return the final result of the tool back to the React frontend (raw JSON Data and English summary)
            return response.json({
                status: 'Success',
                toolUsed: toolName,
                summary: finalSummary,
                rawData: toolResult
            });
        }
        else {
            // LLM will only return text responses
            console.log("\n💬 Llama responded directly:", responseMessage.content);
            return response.json({ status: "Direct response", text: responseMessage.content });
        }
    } catch (error) {
        console.error("Orchestration error:", error);
        return response.status(500).json({ error: "Failed to run orchestrator" });
    }
});

// Dedicated SSE endpoint for pipeline status updates
app.get('/api/status', (request, response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    // Function to send the text to the frontend
    const sendUpdate = (text) => {
        response.write(`data: ${text}\n\n`);
    };

    // Listen for broadcasts and send them to the client
    pipelineProgress.on('status', sendUpdate);

    // Clean up the listener if the client disconnects
    request.on('close', () => {
        pipelineProgress.off('status', sendUpdate);
    });
});

// Start listening
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`MCP Express Server running on http://localhost:${PORT}`);
});