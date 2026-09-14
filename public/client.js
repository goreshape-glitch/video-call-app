(() => {
    const joinScreen = document.getElementById('join-screen');
    const callScreen = document.getElementById('call-screen');
    const roomInput = document.getElementById('room-input');
    const joinBtn = document.getElementById('join-btn');
    const joinError = document.getElementById('join-error');
    const roomNameEl = document.getElementById('room-name');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const statusEl = document.getElementById('status');
    const videoGrid = document.getElementById('video-grid');
    const micBtn = document.getElementById('mic-btn');
    const camBtn = document.getElementById('cam-btn');
    const hangupBtn = document.getElementById('hangup-btn');

   const ICE_SERVERS = [
     { urls: 'stun:stun.l.google.com:19302' },
     { urls: 'stun:stun1.l.google.com:19302' },
       ];

   let sb = null;
    let channel = null;
    let myId = null;
    let room = null;
    let localStream = null;
    let micOn = true;
    let camOn = true;

   const peers = new Map();

   function prefillRoomFromUrl() {
         const params = new URLSearchParams(window.location.search);
         const r = params.get('room');
         if (r) roomInput.value = r;
   }

   function setStatus(text) {
         statusEl.textContent = text;
   }

   function showError(text) {
         joinError.textContent = text;
         joinError.hidden = false;
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

   function sendSignal(to, data) {
         if (!channel) return;
         channel.send({
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
                        entry.videoEl = addVideoTile(peerId, event.streams[0], 'Peer', false);
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

   async function logRoomEvent(event) {
         if (!sb) return;
         try {
                 await sb.from('rooms').upsert(
                   { name: room, last_active_at: new Date().toISOString() },
                   { onConflict: 'name' }
                         );
                 await sb.from('room_events').insert({
                           room_name: room,
                           peer_id: myId,
                           event,
                 });
         } catch (err) {
                 console.warn('Supabase logging skipped:', err.message || err);
         }
   }

   function connectSignaling() {
         channel = sb.channel(`room-${room}`, {
                 config: { presence: { key: myId } },
         });

      channel.on('presence', { event: 'sync' }, () => {
              const state = channel.presenceState();
              const peerIds = Object.keys(state).filter((id) => id !== myId);
              setStatus(peerIds.length ? 'Connected' : 'Waiting for someone to join…');
              peerIds.forEach((peerId) => {
                        if (!peers.has(peerId)) {
                                    const initiator = myId < peerId;
                                    createPeerConnection(peerId, initiator);
                        }
              });
      });

      channel.on('presence', { event: 'leave' }, ({ key }) => {
              closePeer(key);
              if (peers.size === 0) setStatus('Waiting for someone to join…');
      });

      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
              if (!payload || payload.to !== myId) return;
              handleSignal(payload.from, payload.data);
      });

      channel.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                        await channel.track({ joined_at: new Date().toISOString() });
                        logRoomEvent('join');
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        setStatus('Connection error — check your Supabase config');
              }
      });
   }

   async function joinCall() {
         const value = roomInput.value.trim();
         if (!value) {
                 showError('Please enter a room name.');
                 return;
         }
         if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR-PROJECT')) {
                 showError('Supabase is not configured yet — fill in config.js with your project URL and anon key.');
                 return;
         }
         joinError.hidden = true;
         room = value;
         myId = crypto.randomUUID();
         sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

      try {
              localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (err) {
              showError('Could not access camera/microphone: ' + err.message);
              return;
      }

      joinScreen.hidden = true;
         callScreen.hidden = false;
         roomNameEl.textContent = room;

      addVideoTile('local', localStream, 'You', true);

      const url = new URL(window.location.href);
         url.searchParams.set('room', room);
         window.history.replaceState({}, '', url);

      connectSignaling();
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

   function hangup() {
         logRoomEvent('leave');
         peers.forEach((_, id) => closePeer(id));
         if (channel) sb.removeChannel(channel);
         if (localStream) localStream.getTracks().forEach((t) => t.stop());
         window.location.href = window.location.pathname;
   }

   copyLinkBtn.addEventListener('click', async () => {
         const url = new URL(window.location.href);
         url.searchParams.set('room', room);
         try {
                 await navigator.clipboard.writeText(url.toString());
                 copyLinkBtn.textContent = 'Copied!';
                 setTimeout(() => (copyLinkBtn.textContent = 'Copy invite link'), 1500);
         } catch {
                 showError('Could not copy link automatically — copy it from the address bar.');
         }
   });

   joinBtn.addEventListener('click', joinCall);
    roomInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') joinCall();
    });
    micBtn.addEventListener('click', toggleMic);
    camBtn.addEventListener('click', toggleCam);
    hangupBtn.addEventListener('click', hangup);

   prefillRoomFromUrl();
})();
