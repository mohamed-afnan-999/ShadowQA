// File: client/src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import axios from "axios";

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mcpStatus, setMcpStatus] = useState('offline');

  // 2. Create the ref and the auto-scroll effect
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMcpStatus('connecting');
    // 1. Open the SSE connection to the backend
    const eventSource = new EventSource('http://localhost:3001/sse');

    eventSource.onopen = () => {
      setMcpStatus('online');
    };

    eventSource.onerror = () => {
      setMcpStatus('offline');
    };

    // 2. Listen for the endpoint URL the MCP server gives us to send messages back to
    eventSource.addEventListener('endpoint', (event) => {
      console.error("MCP POST Endpoint established:", event.data);
      // TODO: We will save this URL into state later to route our POST requests
    });

    return () => eventSource.close();
  }, []);

  const handleSend = async () => {
    if (!input.trim())  return;

    const userMessage = input;

    // add the new message to the previous messages from the chat between LLM and user
    setMessages(prevMessages => [...prevMessages, { text: userMessage, sender: 'user' }]);
    setInput('');

    // TODO: Get actual final LLM response and stream status messages during the task execution like: 'Transcribing Audio....', 'Retreiving Past Audits for ......', etc
    try {
      // send a POST /api/orchestrate request to the server -> receive a response -> extract the data (LLM response)
      const response = await axios.post("http://localhost:3001/api/orchestrate", { prompt: userMessage });
      const data = response.data;

      setMessages(prevMessages => [...prevMessages, {text: JSON.stringify(data, null, 2), sender: 'llm'}]);

    } catch(error) {
      setMessages(prevMessages => [...prevMessages, {text: `Error connecting to the server:\n ${error.message}`, sender: 'llm'}]);
    }
  }

  return (
      <div className="App">
        {/* Dynamic Status Indicator */}
        <div className="status-indicator">
          <span className={`status-dot ${mcpStatus}`}></span>
          MCP Server: {mcpStatus}
        </div>

        <div className="chat-window">
          {messages.map((message, index) => (
              <div key={index} className={`message ${message.sender}`}>
                {message.text}
              </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input">
          <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
          />
          <button onClick={handleSend} disabled={mcpStatus !== 'online'}>Send</button>
        </div>
      </div>
  )
}

export default App;