// File: client/src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from "axios";
import ReactMarkdown from 'react-markdown';
import QAChecklistAdmin from './QAChecklistAdmin';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mcpStatus, setMcpStatus] = useState('offline');
  const [isProcessing, setIsProcessing] = useState(false);

  // 2. Create the ref and the auto-scroll effect
  const messagesEndRef = useRef(null);

  // auto-scroll to bottom effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // MCP Server Connection Status Effect
  useEffect(() => {
    setMcpStatus('connecting');

    // Simply ping the backend health endpoint to check if it's online
    axios.get('http://localhost:3001/')
        .then(() => setMcpStatus('online'))
        .catch(() => setMcpStatus('offline'));
  }, []);

  // Listen for real-time pipeline status updates
  useEffect(() => {
    const statusSource = new EventSource('http://localhost:3001/api/status');

    statusSource.onmessage = (event) => {
      // Add the status update to the chat as a system message
      setMessages(prevMessages => [
        ...prevMessages,
        { text: `⏳ ${event.data}`, sender: 'system' }
      ]);
    };

    return () => statusSource.close();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isProcessing)  return;

    const userMessage = input;

    // add the new message to the previous messages from the chat between LLM and user
    setMessages(prevMessages => [...prevMessages, { text: userMessage, sender: 'user' }]);
    setInput('');
    setIsProcessing(true);    // lock the UI to prevent entering new requests while another is already running

    try {
      // send a POST /api/orchestrate request to the server -> receive a response -> extract the data (LLM response)
      const response = await axios.post("http://localhost:3001/api/orchestrate", { prompt: userMessage });
      const data = response.data;

      if(!data) {
        setMessages(prevMessages => [...prevMessages, { text: `LLM response is empty. Retry....`}]);
      }
      else {
        // If it's a tool execution that generated a summary, print the clean summary.
        // If it's just a normal conversation, print the text.
        // Fallback to JSON only if something unexpected happens.
        const outputText = data.summary || data.text || JSON.stringify(data, null, 2);
        setMessages(prevMessages => [...prevMessages, { text: outputText, sender: 'llm' }]);
      }

    } catch(error) {
      setMessages(prevMessages => [...prevMessages, { text: `Error connecting to the server:\n\t ${error.message}`, sender: 'llm' }]);
    } finally {
      setIsProcessing(false); // unlock the UI when done or after it fails
    }
  }

  return (
      <div className="App">
        {/* Dynamic Status Indicator */}
        <div className="status-indicator">
          <span className={`status-dot ${mcpStatus}`}></span>
          MCP Server: {mcpStatus}
        </div>

        {/* The New Admin Panel */}
        <QAChecklistAdmin />

        <div className="chat-window">
          {messages.map((message, index) => (
              <div key={index} className={`message ${message.sender}`}>
                <ReactMarkdown>{message.text}</ReactMarkdown>
              </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input">
          <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={ isProcessing? "Processing your request..." : "Type your message..." }
              disabled={isProcessing}
          />
          <button onClick={handleSend} disabled={mcpStatus !== 'online' || isProcessing}>
            { isProcessing? '⏳' : "Send" }
          </button>
        </div>
      </div>
  )
}

export default App;