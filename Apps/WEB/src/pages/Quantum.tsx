import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Basis, Bit, QuantumKeyService } from '../services/quantumService';
import '../styles/Quantum.css';

type HandshakeStatus =
  | 'initializing'
  | 'ready_to_start'
  | 'waiting_for_photons'
  | 'transmitting'
  | 'waiting_for_bob'
  | 'ready_to_measure'
  | 'measuring'
  | 'waiting_for_alice'
  | 'sifting'
  | 'secure'
  | 'failed';

const statusProgress: Record<HandshakeStatus, number> = {
  initializing: 0,
  ready_to_start: 0,
  waiting_for_photons: 20,
  transmitting: 35,
  waiting_for_bob: 55,
  ready_to_measure: 60,
  measuring: 72,
  waiting_for_alice: 82,
  sifting: 90,
  secure: 100,
  failed: 0,
};

const getStatusMessage = (status: HandshakeStatus) => {
  switch (status) {
    case 'initializing':
      return 'Waking up quantum channel...';
    case 'ready_to_start':
      return 'Channel idle. Ready to initiate.';
    case 'waiting_for_photons':
      return 'Peer is preparing photons...';
    case 'transmitting':
      return 'Firing 256 polarized photons...';
    case 'waiting_for_bob':
      return 'Photons in transit. Awaiting Bob.';
    case 'ready_to_measure':
      return 'Photons arrived. Ready to measure.';
    case 'measuring':
      return 'Applying random measurement bases...';
    case 'waiting_for_alice':
      return "Bases sent. Awaiting Alice's sifting.";
    case 'sifting':
      return 'Comparing bases. Discarding mismatches...';
    case 'secure':
      return 'AES-256 key generated successfully.';
    case 'failed':
      return 'Quantum exchange failed. Retry.';
    default:
      return 'Waiting for quantum exchange to begin...';
  }
};

const Quantum: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [role, setRole] = useState<'alice' | 'bob' | null>(null);
  const [status, setStatus] = useState<HandshakeStatus>('initializing');
  const [loading, setLoading] = useState(false);
  const [matchingCount, setMatchingCount] = useState(0);
  const [keyHex, setKeyHex] = useState('');
  const [error, setError] = useState('');
  const [targetName, setTargetName] = useState('UNKNOWN PEER');

  const aliceDataRef = useRef<{ bits: Bit[]; bases: Basis[] } | null>(null);
  const roleLocked = useRef(false);
  const isAbortingRef = useRef(false);

  const sessionId = useMemo(() => {
    if (!currentUser?.uid || !userId) return 'waiting_room';
    return [currentUser.uid, userId].sort().join('_');
  }, [currentUser?.uid, userId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const readTargetUser = async () => {
      const targetRef = doc(db, 'users', userId);
      const snap = await getDoc(targetRef);
      if (snap.exists()) {
        const data = snap.data() as { displayName?: string; email?: string };
        setTargetName((data.displayName || data.email || 'UNKNOWN PEER').toUpperCase());
      }
    };

    readTargetUser();
  }, [userId]);

  useEffect(() => {
    if (!currentUser || !userId || sessionId === 'waiting_room') return;

    const sessionRef = doc(db, 'sessions', sessionId);
    const unsubscribe = onSnapshot(sessionRef, async (snapshot) => {
      if (!snapshot.exists()) {
        await setDoc(
          sessionRef,
          {
            status: 'ready_to_start',
            createdAt: new Date().toISOString(),
          },
          { merge: true },
        );
        return;
      }

      const data = snapshot.data() as {
        status?: HandshakeStatus;
        aliceId?: string | null;
        quantumPayload?: number[] | null;
        bobBases?: Basis[] | null;
        matchingIndexes?: number[] | null;
        handshakeComplete?: boolean;
      };

      if (roleLocked.current && data.status === 'initializing' && !isAbortingRef.current) {
        setError('Peer terminated the quantum key exchange.');
        setRole(null);
        roleLocked.current = false;
        aliceDataRef.current = null;
      }

      if (!roleLocked.current && data.aliceId) {
        if (data.aliceId === currentUser.uid) {
          setRole('alice');
        } else {
          setRole('bob');
        }
        roleLocked.current = true;
      }

      if (data.handshakeComplete) {
        setStatus('secure');

        const payloadBits = Array.isArray(data.quantumPayload) ? data.quantumPayload : [];
        const indexes = Array.isArray(data.matchingIndexes) ? data.matchingIndexes : [];
        const finalBits: Bit[] = indexes
          .map((i) => payloadBits[i])
          .filter((b) => b === 0 || b === 1)
          .map((b) => (b === 1 ? 1 : 0));

        setMatchingCount(finalBits.length);
        setKeyHex(QuantumKeyService.formatToHex(finalBits));
      } else if (data.bobBases) {
        setStatus(
          role === 'alice' || (roleLocked.current && data.aliceId === currentUser.uid)
            ? 'sifting'
            : 'waiting_for_alice',
        );
      } else if (data.quantumPayload) {
        setStatus(
          role === 'bob' || (roleLocked.current && data.aliceId !== currentUser.uid)
            ? 'ready_to_measure'
            : 'waiting_for_bob',
        );
      } else if (data.aliceId) {
        setStatus(
          role === 'bob' || (roleLocked.current && data.aliceId !== currentUser.uid)
            ? 'waiting_for_photons'
            : 'transmitting',
        );
      } else {
        setStatus('ready_to_start');
      }
    });

    return () => unsubscribe();
  }, [currentUser, userId, sessionId, role]);

  useEffect(() => {
    if (role !== 'alice' || sessionId === 'waiting_room') return;

    const sessionRef = doc(db, 'sessions', sessionId);
    const unsubscribe = onSnapshot(sessionRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as { bobBases?: Basis[]; handshakeComplete?: boolean };

      if (data.bobBases && aliceDataRef.current) {
        const matchingIndexes = aliceDataRef.current.bases
          .map((basis, index) => (basis === data.bobBases?.[index] ? index : null))
          .filter((v): v is number => v !== null);

        if (!data.handshakeComplete) {
          await updateDoc(sessionRef, {
            matchingIndexes,
            handshakeComplete: true,
            status: 'secure',
          });
        }
      }
    });

    return () => unsubscribe();
  }, [role, sessionId]);

  useEffect(() => {
    if (status !== 'secure' || !userId) return;

    const timer = window.setTimeout(() => {
      navigate(`/chat/${userId}`);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [status, userId, navigate]);

  const firePhotons = async () => {
    if (loading || !currentUser || sessionId === 'waiting_room') return;

    setLoading(true);
    setError('');

    setRole('alice');
    roleLocked.current = true;
    setStatus('transmitting');

    const sessionRef = doc(db, 'sessions', sessionId);
    await setDoc(
      sessionRef,
      {
        aliceId: currentUser.uid,
        status: 'transmitting',
        handshakeComplete: false,
        abortedAt: null,
        abortedBy: null,
      },
      { merge: true },
    );

    const result = await QuantumKeyService.generateAndTransmit(256, false);
    if (!result.success) {
      setStatus('failed');
      setError(result.error || 'Unknown API error');
      setRole(null);
      roleLocked.current = false;

      await updateDoc(sessionRef, {
        aliceId: null,
        status: 'ready_to_start',
      });

      setLoading(false);
      return;
    }

    aliceDataRef.current = {
      bits: result.aliceBits,
      bases: result.aliceBases,
    };

    await updateDoc(sessionRef, {
      quantumPayload: result.photonsForBob,
      status: 'photons_sent',
    });

    setLoading(false);
  };

  const measurePhotons = async () => {
    if (!currentUser || sessionId === 'waiting_room') return;

    setLoading(true);
    setStatus('measuring');
    setError('');

    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);
    const photons = snap.data()?.quantumPayload as number[] | undefined;

    if (!photons || photons.length === 0) {
      setError('No photons available to measure.');
      setStatus('ready_to_measure');
      setLoading(false);
      return;
    }

    const bobBases: Basis[] = photons.map(() => (Math.random() > 0.5 ? 'X' : '+'));
    await updateDoc(sessionRef, {
      bobBases,
      status: 'measured',
    });

    setLoading(false);
  };

  const abortProtocol = () => {
    if (loading || !currentUser || sessionId === 'waiting_room') return;

    const resetSession = async () => {
      isAbortingRef.current = true;
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        handshakeComplete: false,
        quantumPayload: null,
        bobBases: null,
        matchingIndexes: null,
        aliceId: null,
        status: 'initializing',
        abortedAt: new Date().toISOString(),
        abortedBy: currentUser.uid,
      });
    };

    resetSession();

    setRole(null);
    roleLocked.current = false;
    aliceDataRef.current = null;
    setStatus('initializing');
    setMatchingCount(0);
    setKeyHex('');
    setError('');
  };

  return (
    <div className="quantum-page">
      <div className="quantum-shell">
        <h1 className="quantum-heading">🔐 Quantum Key Exchange</h1>
        <p className="quantum-subheading">BB84 Protocol</p>

        <div className="quantum-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <p className="quantum-top-message">{role ? `Identity locked: ${role.toUpperCase()}` : 'Awaiting initiator...'}</p>

        <div className="quantum-progress-wrap">
          <p className="quantum-percent">{statusProgress[status]}%</p>
          <div className="quantum-progress-track">
            <div className="quantum-progress-fill" style={{ width: `${statusProgress[status]}%` }} />
          </div>
        </div>

        <p className="quantum-main-status">{getStatusMessage(status)}</p>
        {error && <p className="quantum-error-line">Error: {error}</p>}

        <div className="quantum-actions">
          {(role === null || role === 'alice') && status === 'ready_to_start' && (
            <button className="quantum-fire-btn" onClick={firePhotons} disabled={loading}>
              🚀 Fire Photons
            </button>
          )}

          {role === 'bob' && status === 'ready_to_measure' && (
            <button className="quantum-fire-btn" onClick={measurePhotons} disabled={loading}>
              🎯 Measure
            </button>
          )}

          {status !== 'secure' && (
            <button className="quantum-abort-btn" onClick={abortProtocol} disabled={loading}>
              ❌ Abort
            </button>
          )}

          {status === 'secure' && (
            <button className="quantum-fire-btn" disabled>
              ✅ Secure
            </button>
          )}
        </div>

        <p className="quantum-debug">
          Debug: sessionData=loaded, aliceId={currentUser?.uid || 'undefined'}, bobId={userId || 'undefined'}, status={status}
        </p>

        <div className="quantum-footer-info">
          <p>Session ID:</p>
          <p className="quantum-footer-value">{sessionId}</p>
          <p>Status:</p>
          <p className="quantum-footer-value">{status}</p>
        </div>

        {status === 'secure' && (
          <div className="quantum-key-box">
            <p>Target: {targetName}</p>
            <p>Sifted Bits: {matchingCount}</p>
            <p>Key: {keyHex}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Quantum;
