# ShadowQA

ShadowQA is an automated Quality Assurance pipeline built to evaluate recruiter performance and regulatory compliance through advanced AI audio transcription and semantic analysis.

This system utilizes the **Model Context Protocol (MCP)** to expose sophisticated audio-processing and database-querying tools to external AI agents, utilizing Groq's high-speed LPU inference engine and MongoDB Atlas for zero-cost, scalable execution.

## 🧠 Core Architecture & Capabilities

The architecture resolves the complex challenge of "semantic shadow reconstruction"—auditing strictly one-sided audio recordings by inferring candidate responses from recruiter affirmations using advanced Prompt Engineering.

*   **Frontend (Client):** A React.js Single Page Application (SPA) providing a conversational interface, a dynamic QA Compliance Checklist manager, and real-time SSE (Server-Sent Events) pipeline telemetry.
*   **Backend (Server):** An Express.js / Node.js backend executing a multi-stage pipeline:
    *   **Concurrent Audio Ingestion:** Downloads partitioned audio chunks from Google Drive APIs.
    *   **Media Optimization:** Uses FFmpeg to stitch chunks, downsample to 16kHz mono, and compress to 64kbps MP3 for optimal transcription.
    *   **Speech-to-Text:** Leverages Groq's `whisper-large-v3-turbo` model for high-velocity transcription.
    *   **Semantic Auditing:** Uses Meta's `llama-3.3-70b-versatile` model to isolate formal interview segments and strictly grade the interaction against a dynamic, MongoDB-backed checklist.
    *   **Stateless MCP Integration:** Implements `StreamableHTTPServerTransport` to securely expose the audit pipeline and historical database querying as tools to AI orchestration agents.

## 📂 Project Structure

```text
Auto-QA-Audit-MCP-Tool/
├── client/                         # React Frontend Application
│   ├── public/                     # Static assets (index.html)
│   ├── src/                        # UI Components and Styling
│   │   ├── App.jsx                 # Main Chat Interface & Orchestration
│   │   ├── QAChecklistAdmin.jsx    # Dynamic MongoDB Checklist Manager
│   │   └── ...                     # CSS files (App.css, index.css)
│   └── package.json            
├── server/                         # Express/Node.js Backend
│   ├── full_recordings/            # Temp storage for stitched master audio files
│   ├── services/                   # Core Pipeline Logic
│   │   ├── audioFetcher.js         # Axios concurrent chunk downloading
│   │   ├── audioService.js         # FFmpeg optimization & Whisper STT
│   │   ├── auditPipeline.js        # Llama 3.3 Orchestration & JSON sanitization
│   │   └── dbService.js            # MongoDB connection caching & CRUD
│   ├── Tools/                      # MCP Tool Definitions (Zod Schemas)
│   ├── temp_audio/                 # Temp storage for downloaded audio chunks
│   ├── main.js                     # Express Router & HTTP Streaming Transport
│   ├── mcpServer.js                # MCP Server Instantiation
│   └── package.json            
├── .env.example                    # Template for environment variables
├── .gitignore                      # Git exclusion rules (ignores temp audio)
└── README.md                       # Project Documentation
```

## ⚙️ Prerequisites
* To run this project locally, ensure you have the following installed:
* **Node.js** (v18.0.0 or higher recommended)
* **FFmpeg**: Must be installed on your operating system and accessible in your system's PATH (required for fluent-ffmpeg to process audio files).
* **MongoDB Atlas Account**: A free M0 cluster is sufficient.
* **Groq API Key**: Free tier access for Whisper and Llama models.

## 🔑 External Account Setup

Before running the application, you must provision two free-tier accounts to retrieve your API keys:

1. **MongoDB Atlas (Database)**:

   * Go to MongoDB Atlas and create a free account.
   * Deploy a free M0 Cluster.
   * Under "Database Access", create a user and password.
   * Under "Network Access", allow access from anywhere (0.0.0.0/0) for testing.
   * Click "Connect" -> "Drivers" -> "Node.js" and copy the connection string. Replace <password> with your user password. This is your MONGODB_URI.


2. **Groq (AI Inference)**:

   * Go to GroqCloud and create a free account.
   * Navigate to "API Keys" in the left sidebar.
   * Click "Create API Key" and copy the generated string. This is your GROQ_API_KEY.

## 🚀 Setup & Installation
1. **Clone the repository**

         git clone [https://github.com/your-username/ShadowQA.git](https://github.com/your-username/ShadowQA.git)
         cd ShadowQA

2. **Configure Environment Variables**
Copy the provided .env.example file in the server directory to a new file named .env:

         cd server
         cp ../.env.example .env

    Populate the .env file with your actual API keys:

         GROQ_API_KEY=gsk_your_actual_api_key_here
         MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/

3. **Install Backend Dependencies & Start Server**

         # Assuming you are still in the /server directory
         npm install
         node main.js
   
    The backend will boot on http://localhost:3001.


4. **Install Frontend Dependencies & Start Client**

    Open a new terminal window
    
         cd client
         npm install
         npm start

    The React client will boot on http://localhost:3000.

## 🧪 Usage Examples

Once both servers are running, access the React UI and try the following End-to-End prompts:
    
### **Run an Audio Audit:**

#### Prompt:  
    Run a full QA audit on this audio file: [Insert Google Drive API Link]

#### **Expected Behavior:**  
The UI will lock, real-time SSE progress indicators will appear, and the AI will output a Markdown-formatted pass/fail compliance summary.

### **Fetch Historical Data:**

#### Prompt: 
    Fetch the historical audit data for [Insert Recruiter Name]

#### Expected Behavior: 
The orchestrator uses the MCP tool to query MongoDB and generates a performance summary based on past audit scores.