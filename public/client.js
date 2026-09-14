(() => {
  const authScreen = document.getElementById('auth-screen');
  const verifyScreen = document.getElementById('verify-screen');
  const welcomeScreen = document.getElementById('welcome-screen');
  const searchingScreen = document.getElementById('searching-screen');
  const callScreen = document.getElementById('call-screen');

  const emailInput = document.getElementById('email-input');
  const sendCodeBtn = document.getElementById('send-code-btn');
  const authError = document.getElementById('auth-error');

  const verifyEmailEl = document.getElementById('verify-email');
  const codeInput = document.getElementById('code-input');
  const verifyBtn = document.getElementById('verify-btn');
  const resendBtn = document.getElementById('resend-btn');
  const changeEmailBtn = document.getElementById('change-email-btn');
  const verifyError = document.getElementById('verify-error');

  const nameInput = document.getElementById('name-input');
  const genderGroup = document.getElementById('gender-group');
  const lookingForGroup = document.getElementById('lookingfor-group');
  const ageCheck = document.getElementById('age-check');
  const startBtn = document.getElementById('start-btn');
  const welcomeError = document.getElementById('welcome-error');
  const cancelSearchBtn = document.getElementById('cancel-search-btn');

  const peerNameEl = document.getElementById('peer-name');
  const statusEl = document.getElementById('status');
  const videoGrid = document.getElementById('video-grid');
  const heartLayer = document.getElementById('heart-layer');
  const micBtn = document.getElementById('mic-btn');
  const camBtn = document.getElementById('cam-btn');
  const likeBtn = document.getElementById('like-btn');
  const nextBtn = document.getElementById('next-btn');
  const hangupBtn = document.getElementById('hangup-btn');

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  let sb = null;
  let matchesChannel = null;
  let roomChannel = null;
  let myId = null;
  let myEmail = null;
  let pendingEmail = null;
  let myName = 'Someone';
  let myGender = null;
  let myLookingFor = null;
  let room = null;
  let partnerId = null;
  let localStream = null;
  let micOn = true;
  let camOn = true;
  let matching = false;

  // peerId -> { pc, videoEl }
  const peers = new Map();

  const ALL_SCREENS = [authScreen, verifyScreen, welcomeScreen, searchingScreen, callScreen];

  function showScreen(el) {
    ALL_SCREENS.forEach((s) => (s.hidden = s !== el));
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function showWelcomeError(text) {
    welcomeError.textContent = text;
    welcomeError.hidden = false;
  }

  function showAuthError(text) {
    authError.textContent = text;
    authError.hidden = false;
  }

  function showVerifyError(text) {
    verifyError.textContent = text;
    verifyError.hidden = false;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setupPillGroup(group) {
    group.querySelectorAll('.pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.pill').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  function getSelected(group) {
    const el = group.querySelector('.pill.selected');
    return el ? el.dataset.value : null;
  }

  function addVideoTile(id, stream, label, muted) {
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = `tile-${id}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;
    video.srcObject = stream;

    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = label;

    tile.appendChild(video);
    tile.appendChild(labelEl);
    videoGrid.appendChild(tile);
    return video;
  }

  function removeVideoTile(id) {
    const tile = document.getElementById(`tile-${id}`);
    if (tile) tile.remove();
  }

  function clearRemoteTiles() {
    videoGrid.querySelectorAll('.video-tile').forEach((tile) => {
      if (tile.id !== 'tile-local') tile.remove();
    });
  }

  function sendSignal(to, data) {
    if (!roomChannel) return;
    roomChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { to, from: myId, data },
    });
  }

  function createPeerConnection(peerId, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(peerId, { pc, videoEl: null });

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, { kind: 'candidate', payload: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const entry = peers.get(peerId);
      if (entry && !entry.videoEl) {
        entry.videoEl = addVideoTile(peerId, event.streams[0], 'Stranger', false);
      }
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(peerId, { kind: 'offer', payload: pc.localDescription });
        } catch (err) {
          console.error('negotiation error', err);
        }
      };
    }

    return pc;
  }

  async function handleSignal(from, data) {
    let entry = peers.get(from);
    let pc = entry && entry.pc;

    if (!pc) {
      pc = createPeerConnection(from, false);
    }

    if (data.kind === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(from, { kind: 'answer', payload: pc.localDescription });
    } else if (data.kind === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
    } else if (data.kind === 'candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.payload));
      } catch (err) {
        console.error('addIceCandidate error', err);
      }
    }
  }

  function closePeer(peerId) {
    const entry = peers.get(peerId);
    if (entry) {
      entry.pc.close();
      peers.delete(peerId);
    }
    removeVideoTile(peerId);
  }

  function spawnHeart() {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = '❤️';
    heart.style.left = 20 + Math.random() * 60 + '%';
    heartLayer.appendChild(heart);
    setTimeout(() => heart.remove(), 2200);
  }

  function connectRoomChannel(roomId) {
    roomChannel = sb.channel(`room-${roomId}`, {
      config: { presence: { key: myId } },
    });

    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      const peerIds = Object.keys(state).filter((id) => id !== myId);
      setStatus(peerIds.length ? 'Connected' : 'Waiting for your match…');
      peerIds.forEach((peerId) => {
        if (!peers.has(peerId)) {
          const initiator = myId < peerId;
          createPeerConnection(peerId, initiator);
        }
      });
    });

    roomChannel.on('presence', { event: 'leave' }, ({ key }) => {
      closePeer(key);
      if (peers.size === 0) setStatus('Your match left — tap Next to meet someone new');
    });

    roomChannel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (!payload || payload.to !== myId) return;
      handleSignal(payload.from, payload.data);
    });

    roomChannel.on('broadcast', { event: 'like' }, () => {
      spawnHeart();
    });

    roomChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({ joined_at: new Date().toISOString(), name: myName });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setStatus('Connection error — please try Next');
      }
    });
  }

  function leaveRoom() {
    peers.forEach((_, id) => closePeer(id));
    clearRemoteTiles();
    if (roomChannel) {
      sb.removeChannel(roomChannel);
      roomChannel = null;
    }
    room = null;
    partnerId = null;
  }

  async function joinRoom(roomId, partner) {
    room = roomId;
    partnerId = partner;
    peerNameEl.textContent = 'Stranger';
    setStatus('Connecting…');
    if (!document.getElementById('tile-local')) {
      addVideoTile('local', localStream, 'You', true);
    }
    showScreen(callScreen);
    connectRoomChannel(roomId);
  }

  async function stopMatchWaiting() {
    matching = false;
    if (matchesChannel) {
      sb.removeChannel(matchesChannel);
      matchesChannel = null;
    }
    try {
      await sb.from('waiting_queue').delete().eq('user_id', myId);
    } catch (err) {
      console.warn('waiting_queue cleanup skipped:', err.message || err);
    }
  }

  async function attemptMatch() {
    matching = true;
    showScreen(searchingScreen);

    // Subscribe first so we never miss a match created by someone else
    // while we're sitting in the waiting queue.
    matchesChannel = sb.channel(`matches-${myId}`);
    matchesChannel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'matches' },
      (payload) => {
        const row = payload.new;
        if (!matching) return;
        if (row.user_a === myId || row.user_b === myId) {
          const partner = row.user_a === myId ? row.user_b : row.user_a;
          matching = false;
          if (matchesChannel) {
            sb.removeChannel(matchesChannel);
            matchesChannel = null;
          }
          joinRoom(row.room_id, partner);
        }
      }
    );

    await new Promise((resolve) => {
      matchesChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    if (!matching) return; // cancelled while subscribing

    try {
      const { data, error } = await sb.rpc('find_match', {
        p_gender: myGender,
        p_looking_for: myLookingFor,
      });
      if (error) throw error;
      if (matching && data && data.length > 0) {
        const row = data[0];
        matching = false;
        if (matchesChannel) {
          sb.removeChannel(matchesChannel);
          matchesChannel = null;
        }
        joinRoom(row.room_id, row.partner_id);
      }
      // otherwise we're now in the waiting_queue and will be matched
      // asynchronously via the matches subscription above.
    } catch (err) {
      console.error('find_match failed', err);
      setStatus('');
      showWelcomeError('Could not reach the matching service. Please try again.');
      matching = false;
      showScreen(welcomeScreen);
    }
  }

  async function startMatching() {
    const name = nameInput.value.trim();
    myGender = getSelected(genderGroup);
    myLookingFor = getSelected(lookingForGroup);

    welcomeError.hidden = true;
    if (!name) return showWelcomeError('Please enter your name.');
    if (!myGender) return showWelcomeError('Please choose your gender.');
    if (!myLookingFor) return showWelcomeError('Please choose who you want to meet.');
    if (!ageCheck.checked) return showWelcomeError('You must confirm you are 18 or older.');
    if (!myId) return showWelcomeError('Please sign in again.');

    myName = name;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      return showWelcomeError('Could not access camera/microphone: ' + err.message);
    }

    attemptMatch();
  }

  function nextMatch() {
    leaveRoom();
    if (!document.getElementById('tile-local')) {
      addVideoTile('local', localStream, 'You', true);
    }
    attemptMatch();
  }

  async function hangup() {
    await stopMatchWaiting();
    leaveRoom();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    videoGrid.innerHTML = '';
    showScreen(welcomeScreen);
  }

  function toggleMic() {
    if (!localStream) return;
    micOn = !micOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    micBtn.classList.toggle('active-off', !micOn);
    micBtn.textContent = micOn ? '🎤' : '🔇';
  }

  function toggleCam() {
    if (!localStream) return;
    camOn = !camOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
    camBtn.classList.toggle('active-off', !camOn);
    camBtn.textContent = camOn ? '📷' : '🚫';
  }

  function sendLike() {
    spawnHeart();
    if (roomChannel) {
      roomChannel.send({ type: 'broadcast', event: 'like', payload: { from: myId } });
    }
  }

  async function sendCode(email) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }

  sendCodeBtn.addEventListener('click', async () => {
    authError.hidden = true;
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) return showAuthError('Please enter a valid email address.');
    if (!sb) return showAuthError('Supabase is not configured yet — fill in config.js.');

    sendCodeBtn.disabled = true;
    try {
      await sendCode(email);
      pendingEmail = email;
      verifyEmailEl.textContent = email;
      codeInput.value = '';
      verifyError.hidden = true;
      showScreen(verifyScreen);
    } catch (err) {
      showAuthError(err.message || 'Could not send the code. Please try again.');
    } finally {
      sendCodeBtn.disabled = false;
    }
  });

  verifyBtn.addEventListener('click', async () => {
    verifyError.hidden = true;
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) return showVerifyError('Enter the 6-digit code from your email.');

    verifyBtn.disabled = true;
    try {
      const { data, error } = await sb.auth.verifyOtp({
        email: pendingEmail,
        token: code,
        type: 'email',
      });
      if (error) throw error;
      myId = data.user.id;
      myEmail = data.user.email;
      if (!nameInput.value.trim()) {
        nameInput.value = myEmail.split('@')[0];
      }
      showScreen(welcomeScreen);
    } catch (err) {
      showVerifyError(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      verifyBtn.disabled = false;
    }
  });

  resendBtn.addEventListener('click', async () => {
    if (!pendingEmail) return;
    verifyError.hidden = true;
    resendBtn.disabled = true;
    try {
      await sendCode(pendingEmail);
      resendBtn.textContent = 'Code sent!';
    } catch (err) {
      showVerifyError(err.message || 'Could not resend the code.');
    } finally {
      setTimeout(() => {
        resendBtn.textContent = 'Resend code';
        resendBtn.disabled = false;
      }, 3000);
    }
  });

  changeEmailBtn.addEventListener('click', () => {
    pendingEmail = null;
    verifyError.hidden = true;
    showScreen(authScreen);
  });

  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCodeBtn.click();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyBtn.click();
  });

  setupPillGroup(genderGroup);
  setupPillGroup(lookingForGroup);

  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startMatching().finally(() => {
      startBtn.disabled = false;
    });
  });

  cancelSearchBtn.addEventListener('click', async () => {
    await stopMatchWaiting();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    showScreen(welcomeScreen);
  });

  micBtn.addEventListener('click', toggleMic);
  camBtn.addEventListener('click', toggleCam);
  likeBtn.addEventListener('click', sendLike);
  nextBtn.addEventListener('click', nextMatch);
  hangupBtn.addEventListener('click', hangup);

  async function init() {
    if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR-PROJECT')) {
      showAuthError('Supabase is not configured yet — fill in config.js.');
      return;
    }
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

    const { data } = await sb.auth.getSession();
    if (data.session && data.session.user) {
      myId = data.session.user.id;
      myEmail = data.session.user.email;
      nameInput.value = myEmail.split('@')[0];
      showScreen(welcomeScreen);
    } else {
      showScreen(authScreen);
    }
  }

  init();
})();
