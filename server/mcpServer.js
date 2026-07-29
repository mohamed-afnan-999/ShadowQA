import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';          // to actually instantiate an MCP server

// instantiate MCP server object
export const mcpServer = new McpServer({
    name: "qa-auditor-server",
    version: "1.0.0"
});

// Import tools
import { runFullAudioAuditTool } from "./Tools/run_full_audio_audit.js";
import { fetchHistoricalAuditTool } from "./Tools/fetch_historical_audit.js";

// Register tools
mcpServer.tool(
    runFullAudioAuditTool.name,
    runFullAudioAuditTool.description,
    runFullAudioAuditTool.schema,
    runFullAudioAuditTool.handler
)

mcpServer.tool(
    fetchHistoricalAuditTool.name,
    fetchHistoricalAuditTool.description,
    fetchHistoricalAuditTool.schema,
    fetchHistoricalAuditTool.handler
)

// Connect the server to a standard Server-Sent Event (SSE) Transport layer in @main.js