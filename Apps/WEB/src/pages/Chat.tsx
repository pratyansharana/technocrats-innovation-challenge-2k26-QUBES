import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, orderBy, onSnapshot, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { Basis, Bit, QuantumKeyService } from '../services/quantumService';
import { EncryptionService } from '../services/encryptionService';
import '../styles/Chat.css';

const QUANTUM_STEPS = ['Alice', 'Channel', 'Bob', 'Sifting', 'Key Ready'];

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  encrypted?: boolean;
  timestamp: Timestamp | Date;
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUser, setChatUser] = useState<ChatUser | null>(null);
  const [fetchingUser, setFetchingUser] = useState(!!userId);
  const [quantumLoading, setQuantumLoading] = useState(false);
  const [eavesdropperActive, setEavesdropperActive] = useState(false);
  const [quantumError, setQuantumError] = useState<string | null>(null);
  const [quantumStatus, setQuantumStatus] = useState('Idle');
  const [quantumStep, setQuantumStep] = useState(0);
  const [matchingCount, setMatchingCount] = useState(0);
  const [finalKeyHex, setFinalKeyHex] = useState('');
  const aliceDataRef = useRef<{ bits: Bit[]; bases: Basis[] } | null>(null);
  const abortedRedirectedRef = useRef(false);

  // Generate a consistent conversation ID based on two user IDs
  const getConversationId = (user1Id: string, user2Id: string) => {
    return [user1Id, user2Id].sort().join('_');
  };

  const conversationId = currentUser && userId ? getConversationId(currentUser.uid, userId) : null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthResolved(true);
    });

    return () => unsubscribe();
  }, []);

  // Fetch the chat user and set up real-time listener
  useEffect(() => {
    if (!userId) return;

    const fetchChatUser = async () => {
      try {
        setFetchingUser(true);
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setChatUser({
            id: userSnap.id,
            ...userSnap.data() as any,
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
  }, [userId]);

  // Set up real-time listener for messages
  useEffect(() => {
    if (!conversationId || !currentUser) return;

    try {
      const messagesRef = collection(db, 'conversations', conversationId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedMessages: Message[] = [];
        snapshot.forEach((doc) => {
          fetchedMessages.push({
            id: doc.id,
            ...doc.data() as any,
          });
        });
        setMessages(fetchedMessages);
        setChatError(null);
      }, (error) => {
        console.error('Realtime listener error:', error);
        setChatError('Unable to load messages. Check Firestore rules and authentication.');
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up message listener:', error);
    }
  }, [conversationId, currentUser]);

  // Watch the handshake session for abort and real-time BB84 key synchronization.
  useEffect(() => {
    if (!currentUser || !userId) return;

    abortedRedirectedRef.current = false;
    const sessionId = getConversationId(currentUser.uid, userId);
    const sessionRef = doc(db, 'sessions', sessionId);

    const unsubscribe = onSnapshot(sessionRef, async (snapshot) => {
      if (!snapshot.exists()) return;

      const data = snapshot.data() as {
        status?: string;
        abortedAt?: string | null;
        aliceId?: string | null;
        quantumPayload?: number[] | null;
        bobBases?: Basis[] | null;
        matchingIndexes?: number[] | null;
        handshakeComplete?: boolean;
      };

      const wasAborted = data.status === 'initializing' && !!data.abortedAt;
      if (wasAborted && !abortedRedirectedRef.current) {
        abortedRedirectedRef.current = true;
        setChatError('Quantum session aborted by peer. Redirecting to users...');
        navigate('/users');
        return;
      }

      // Bob auto-generates random measurement bases when Alice starts rekey.
      if (
        data.status === 'rekeying'
        && Array.isArray(data.quantumPayload)
        && data.aliceId !== currentUser.uid
        && !Array.isArray(data.bobBases)
      ) {
        const bobBases: Basis[] = data.quantumPayload.map(() => (Math.random() > 0.5 ? 'X' : '+'));
        await updateDoc(sessionRef, { bobBases });
      }

      // Alice performs sifting after Bob publishes bases.
      if (
        data.status === 'rekeying'
        && Array.isArray(data.bobBases)
        && data.aliceId === currentUser.uid
        && !Array.isArray(data.matchingIndexes)
        && aliceDataRef.current
      ) {
        const matchingIndexes = aliceDataRef.current.bases
          .map((basis, index) => (basis === data.bobBases?.[index] ? index : null))
          .filter((index): index is number => index !== null);

        await updateDoc(sessionRef, {
          matchingIndexes,
          handshakeComplete: true,
          status: 'secure',
        });
      }

      // Both sides derive the exact same key from session data.
      if (data.handshakeComplete && Array.isArray(data.matchingIndexes) && Array.isArray(data.quantumPayload)) {
        const siftedBits: Bit[] = data.matchingIndexes
          .map((idx) => data.quantumPayload?.[idx])
          .filter((bit): bit is number => bit === 0 || bit === 1)
          .map((bit) => (bit === 1 ? 1 : 0));

        setMatchingCount(siftedBits.length);
        setFinalKeyHex(QuantumKeyService.formatToHex(siftedBits));
        setQuantumStep(5);
        setQuantumStatus('Secure key synchronized in real time.');
        setQuantumLoading(false);
        setQuantumError(null);
      } else if (data.status === 'rekeying') {
        if (data.aliceId === currentUser.uid) {
          setQuantumStep(2);
          setQuantumStatus('Alice: waiting for Bob measurement bases...');
        } else {
          setQuantumStep(3);
          setQuantumStatus('Bob: measuring photons and publishing bases...');
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser, userId, navigate]);

  const handleSendMessage = async () => {
    if (!input.trim() || !conversationId || !currentUser) return;

    setLoading(true);
    try {
      const messagesRef = collection(db, 'conversations', conversationId, 'messages');
      const shouldEncrypt = finalKeyHex.length > 0;
      const payloadText = shouldEncrypt
        ? EncryptionService.encrypt(input, finalKeyHex)
        : input;

      await addDoc(messagesRef, {
        text: payloadText,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Anonymous',
        encrypted: shouldEncrypt,
        timestamp: Timestamp.now(),
      });
      setInput('');
      setChatError(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setChatError('Failed to send message. Check Firestore rules and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    navigate('/users');
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const runQuantumHandshake = async () => {
    if (!currentUser || !userId) return;

    setQuantumLoading(true);
    setQuantumError(null);
    setFinalKeyHex('');
    setMatchingCount(0);
    setQuantumStep(1);
    setQuantumStatus('Preparing BB84 transmission...');
    await wait(500);
    setQuantumStep(2);
    setQuantumStatus('Publishing photons to shared session...');

    const result = await QuantumKeyService.generateAndTransmit(256, eavesdropperActive);

    if (!result.success) {
      setQuantumError(result.error || 'Quantum channel failed.');
      setQuantumStatus('Quantum channel failed');
      setFinalKeyHex('');
      setMatchingCount(0);
      setQuantumStep(0);
      setQuantumLoading(false);
      return;
    }

    aliceDataRef.current = {
      bits: result.aliceBits,
      bases: result.aliceBases,
    };

    const sessionId = getConversationId(currentUser.uid, userId);
    const sessionRef = doc(db, 'sessions', sessionId);

    await setDoc(
      sessionRef,
      {
        handshakeComplete: false,
        quantumPayload: result.photonsForBob,
        bobBases: null,
        matchingIndexes: null,
        aliceId: currentUser.uid,
        status: 'rekeying',
        abortedAt: null,
        abortedBy: null,
      },
      { merge: true },
    );

    setQuantumStep(3);
    setQuantumStatus('Waiting for peer to complete BB84 measurement...');
  };

  const abortQuantumHandshake = async () => {
    if (!currentUser || !userId || quantumLoading) return;

    const sessionId = getConversationId(currentUser.uid, userId);
    const sessionRef = doc(db, 'sessions', sessionId);

    await setDoc(
      sessionRef,
      {
        handshakeComplete: false,
        quantumPayload: null,
        bobBases: null,
        matchingIndexes: null,
        aliceId: null,
        status: 'initializing',
        abortedAt: new Date().toISOString(),
        abortedBy: currentUser.uid,
      },
      { merge: true },
    );
  };

  const getMessageText = (msg: Message): string => {
    if (!msg.encrypted) {
      return msg.text;
    }

    if (!finalKeyHex) {
      return '[Encrypted] Run BB84 handshake to decrypt this message.';
    }

    const decrypted = EncryptionService.decrypt(msg.text, finalKeyHex);
    return decrypted || '[Encrypted] Unable to decrypt with current key.';
  };

  if (!authResolved) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#ffffff' }}>Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#ffffff' }}>Please login again to continue chatting.</p>
        </div>
      </div>
    );
  }

  if (fetchingUser) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#ffffff' }}>Loading user...</p>
        </div>
      </div>
    );
  }

  if (userId && !chatUser) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#ffffff' }}>User not found</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <p style={{ color: '#ffffff' }}>Open chat from the Users page.</p>
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
        <div className="quantum-panel">
          <div className="quantum-panel-header">
            <p className="quantum-panel-title">BB84 Handshake</p>
            <label className="quantum-toggle">
              <input
                type="checkbox"
                checked={eavesdropperActive}
                onChange={(e) => setEavesdropperActive(e.target.checked)}
                disabled={quantumLoading}
              />
              Eve
            </label>
          </div>
          <div className="quantum-progress">
            <div className="quantum-progress-line" />
            <div
              className="quantum-progress-line-active"
              style={{ width: `${(Math.max(quantumStep - 1, 0) / (QUANTUM_STEPS.length - 1)) * 100}%` }}
            />
            {QUANTUM_STEPS.map((label, index) => {
              const stepNumber = index + 1;
              const isCompleted = quantumStep > stepNumber;
              const isActive = quantumStep === stepNumber;

              return (
                <div
                  key={label}
                  className={`quantum-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`.trim()}
                >
                  <span className="quantum-step-dot" />
                  <span className="quantum-step-label">{label}</span>
                </div>
              );
            })}
          </div>
          <p className="quantum-status">{quantumStatus}</p>
          {quantumError && <p className="quantum-error">{quantumError}</p>}
          {finalKeyHex && (
            <>
              <p className="quantum-meta">Sifted bits: {matchingCount}</p>
              <p className="quantum-key">{finalKeyHex}</p>
            </>
          )}
          <div className="quantum-actions-row">
            <button
              className="quantum-btn"
              onClick={runQuantumHandshake}
              disabled={quantumLoading}
            >
              {quantumLoading ? 'Running...' : 'Run Key Exchange'}
            </button>
            <button
              className="quantum-btn quantum-btn-danger"
              onClick={abortQuantumHandshake}
              disabled={quantumLoading}
            >
              Abort
            </button>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {chatError && (
          <div className="chat-empty">
            <p>{chatError}</p>
          </div>
        )}
        {!chatError && messages.length === 0 ? (
          <div className="chat-empty">
            <p>Start a conversation</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${msg.senderId === currentUser?.uid ? 'user' : 'bot'}`}
            >
              <div className="message-content">{getMessageText(msg)}</div>
              <div className="message-time">
                {msg.timestamp instanceof Timestamp
                  ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : msg.timestamp instanceof Date
                    ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ''
                }
              </div>
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
