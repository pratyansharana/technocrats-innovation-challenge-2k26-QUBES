import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import '../styles/Chat.css';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  senderId?: string;
  timestamp: Date;
}

interface ChatUser {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
}

const Chat: React.FC = () => {
  const { userId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatUser, setChatUser] = useState<ChatUser | null>(null);
  const [fetchingUser, setFetchingUser] = useState(!!userId);

  useEffect(() => {
    if (userId) {
      const fetchChatUser = async () => {
        try {
          setFetchingUser(true);
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setChatUser({
              id: userSnap.id,
              ...userSnap.data(),
            });
          } else {
            setChatUser(null);
          }
        } catch (error) {
          console.error('Error fetching user:', error);
          setChatUser(null);
        } finally {
          setFetchingUser(false);
        }
      };
      fetchChatUser();
    }
  }, [userId]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      senderId: auth.currentUser?.uid,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Simulate bot response
    setTimeout(() => {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Thanks for the message! This is a demo response. Real messaging coming soon!',
        sender: 'bot',
        senderId: userId,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
      setLoading(false);
    }, 500);
  };

  const handleBackClick = () => {
    navigate('/users');
  };

  if (fetchingUser) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#888' }}>Loading user...</p>
        </div>
      </div>
    );
  }

  if (userId && !chatUser) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#888' }}>User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <button className="back-button" onClick={handleBackClick}>←</button>
        <div className="chat-user-info">
          {chatUser?.photoURL && (
            <img src={chatUser.photoURL} alt={chatUser.displayName} className="chat-user-avatar" />
          )}
          {!chatUser?.photoURL && (
            <div className="chat-user-avatar-placeholder">
              {(chatUser?.displayName || chatUser?.email || 'User')[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1>{chatUser?.displayName || 'Anonymous'}</h1>
            <p className="chat-user-email">{chatUser?.email || ''}</p>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>Start a conversation</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${msg.sender}`}
            >
              <div className="message-content">{msg.text}</div>
            </div>
          ))
        )}
      </div>

      <div className="chat-input-container">
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSendMessage}
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default Chat;
