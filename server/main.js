import express, {request, response} from 'express';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { mcpServer } from './mcpServer.js';

const app = express();
let transport;

app.get('/', (request, response) => {
    response.json({
        status: 'online',
        service: 'qa-auditor-mcp-server',
        timestamp: new Date().toISOString()
    });
});

app.get('/sse', async (request, response) => {
    transport = new SSEServerTransport('/messages', response);
    await mcpServer.connect(transport);
    console.error("SSE connection established with client.");
});

app.post('/messages', async (request, response) => {
    if(!transport) {
        response.status(400).send('SSE connection not established yet');
        return;
    }
    await transport.handlePostMessage(request, response);
});

// 4. Start listening
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.error(`MCP Express Server running on http://localhost:${PORT}`);
});