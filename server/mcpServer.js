import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';          // to actually instantiate an MCP server
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";     // transport channel between MCP client and server
import { z } from 'zod';      // data validation library
import Groq from 'groq-sdk';
import fs from "fs";
import path, {dirname} from "path";
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import os from "os";
import axios from 'axios';
import ffmpeg from "fluent-ffmpeg";     // any audio file -> mp3 conversion
import { randomUUID } from "crypto";    // for temp mp3 filename

const __dirname = dirname(fileURLToPath(import.meta.url))   // current dir
dotenv.config({ patg: path.join(__dirname, ".env") });

//Initialise Groq client
if(!process.env.GROQ_API_KEY) {
    console.error("Warning: GROQ_API_KEY is not defined in the environment.")
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
}) // API key can be passed implictly also

// instantiate MCP server object
const server = new McpServer({
    name: "qa-auditor-server",
    version: "1.0.0"
});

// Import tools
import { transcribeRecruiterAudioTool} from "./Tools/transcribe_recruiter_audio.js";
import { isolateInterviewSegmentTool } from "./Tools/isolate_interview_segment.js";
import { runComplianceAuditTool } from "./Prompts/run_compliance_audit.js";

// Register tools
server.tool(
    transcribeRecruiterAudioTool.name,
    transcribeRecruiterAudioTool.description,
    transcribeRecruiterAudioTool.schema,
    transcribeRecruiterAudioTool.handler
)

server.tool(
    isolateInterviewSegmentTool.name,
    isolateInterviewSegmentTool.description,
    isolateInterviewSegmentTool.schema,
    isolateInterviewSegmentTool.handler
)

server.tool(
    runComplianceAuditTool.name,
    runComplianceAuditTool.description,
    runComplianceAuditTool.schema,
    runComplianceAuditTool.handler
)

// Connect the server to a standard I/O Transport layer
const transport = new StdioServerTransport();
await server.connect(transport);