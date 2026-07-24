import React, { useState } from 'react';
import './App.css';

function App() {
  // State to hold the messages in the chat
  const [messages, setMessages] = useState([]);
  // State to hold the current input from the user
  const [input, setInput] = useState('');

  // Function to handle sending a message
  const handleSend = () => {
    if (input.trim()) {
      // Add the user's message to the messages array
      setMessages([...messages, { text: input, sender: 'user' }]);
      // Clear the input field
      setInput('');
      // Here you would typically send the message to the LLM and get a response
      // For now, we'll just simulate a response
      setTimeout(() => {
        setMessages(prevMessages => [...prevMessages, { text: 'This is a response from the LLM.', sender: 'llm' }]);
      }, 1000);
    }
  };

  return (
    <div className="App">
      <div className="chat-window">
        {/* Map over the messages and display them */}
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.sender}`}>
            {message.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        {/* Input field for the user's message */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your message..."
        />
        {/* Button to send the message */}
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}

export default App;