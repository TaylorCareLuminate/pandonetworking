/**
 * Google Photos random video player (Picker API).
 * Personal use — OAuth token stays in sessionStorage; library in localStorage.
 */

const CLIENT_ID = '460355987244-eejutsk9lo2bbtm95s8i2e4oscpsoket.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const PICKER_BASE = 'https://photospicker.googleapis.com/v1';
const STORAGE_KEY = 'gphotos_player_library';
const MEDIA_PROXY = '/api/gphotos/media';

let tokenClient = null;
let shuffleQueue = null;
let overlayTimer = null;
let isPlaying = false;

const $ = (id) => document.getElementById(id);

function waitForGoogle() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function saveToken(response) {
  sessionStorage.setItem('gphotos_token', response.access_token);
  if (response.expires_in) {
    sessionStorage.setItem(
      'gphotos_token_exp',
      String(Date.now() + response.expires_in * 1000)
    );
  }
}

function getToken() {
  const token = sessionStorage.getItem('gphotos_token');
  const exp = Number(sessionStorage.getItem('gphotos_token_exp') || 0);
  if (!token || Date.now() > exp - 60_000) return null;
  return token;
}

function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveLibrary(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearLibrary() {
  localStorage.removeItem(STORAGE_KEY);
}

function setStatus(message, isError = false) {
  const el = $('status');
  el.textContent = message;
  el.className = isError ? 'status error' : 'status';
}

function parseDurationSeconds(value) {
  if (!value) return 3;
  const match = String(value).match(/^([\d.]+)s$/);
  return match ? Math.max(1, Math.ceil(parseFloat(match[1]))) : 3;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoDownloadUrl(baseUrl) {
  return baseUrl.includes('=') ? `${baseUrl}&dv` : `${baseUrl}=dv`;
}

function buildStreamUrl(baseUrl) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');

  const params = new URLSearchParams({
    url: videoDownloadUrl(baseUrl),
    token,
  });
  return `${MEDIA_PROXY}?${params.toString()}`;
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${PICKER_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `API error ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function signIn(forceConsent = false) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      saveToken(response);
      resolve(response.access_token);
    };
    tokenClient.requestAccessToken({
      prompt: forceConsent ? 'consent' : '',
    });
  });
}

async function ensureSignedIn() {
  const token = getToken();
  if (token) return token;
  return signIn(true);
}

async function createPickerSession() {
  return apiFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      pickingConfig: { maxItemCount: '2000' },
    }),
  });
}

async function getSession(sessionId) {
  return apiFetch(`/sessions/${encodeURIComponent(sessionId)}`);
}

async function pollUntilPicked(sessionId) {
  const started = Date.now();
  let pollIntervalMs = 2000;
  let timeoutMs = 5 * 60 * 1000;

  while (true) {
    const session = await getSession(sessionId);
    if (session.mediaItemsSet) return session;

    if (session.pollingConfig) {
      pollIntervalMs = parseDurationSeconds(session.pollingConfig.pollInterval) * 1000;
      const timeoutSec = parseDurationSeconds(session.pollingConfig.timeoutIn);
      if (timeoutSec > 0) timeoutMs = timeoutSec * 1000;
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error('Picker timed out. Try again and finish selecting videos.');
    }

    await sleep(pollIntervalMs);
  }
}

async function listAllPickedVideos(sessionId) {
  const videos = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      sessionId,
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await apiFetch(`/mediaItems?${params.toString()}`);
    for (const item of data.mediaItems || []) {
      if (item.type === 'VIDEO') videos.push(item);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return videos;
}

async function pickVideos() {
  setStatus('Creating picker session…');
  $('btn-pick').disabled = true;

  try {
    await ensureSignedIn();
    const session = await createPickerSession();
    const pickerUrl = `${session.pickerUri}/autoclose`;

    setStatus('Google Photos opened — select videos, then return here.');
    window.open(pickerUrl, 'gphotos-picker', 'width=520,height=720');

    const completed = await pollUntilPicked(session.id);
    const videos = await listAllPickedVideos(session.id);

    if (!videos.length) {
      setStatus('No videos were selected. Pick again and choose video files.', true);
      return;
    }

    saveLibrary({
      sessionId: session.id,
      expireTime: completed.expireTime,
      videoCount: videos.length,
      savedAt: new Date().toISOString(),
    });

    setStatus(`Saved ${videos.length} video${videos.length === 1 ? '' : 's'}. Press Start playback.`);
    updateLibrarySummary();
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Failed to pick videos', true);
  } finally {
    $('btn-pick').disabled = false;
  }
}

async function refreshVideosFromSession() {
  const library = loadLibrary();
  if (!library?.sessionId) throw new Error('No saved library. Pick videos first.');

  if (library.expireTime && Date.now() > new Date(library.expireTime).getTime()) {
    throw new Error('Your picker session expired. Pick videos again.');
  }

  await ensureSignedIn();
  return listAllPickedVideos(library.sessionId);
}

function showPlayer() {
  $('setup-screen').hidden = true;
  $('player-screen').hidden = false;
  document.body.classList.add('player-active');
}

function showSetup() {
  stopPlayback();
  $('setup-screen').hidden = false;
  $('player-screen').hidden = true;
  document.body.classList.remove('player-active');
}

function updateNowPlaying(item) {
  const filename = item.mediaFile?.filename || 'Video';
  const created = item.createTime
    ? new Date(item.createTime).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';
  $('now-playing').textContent = created ? `${filename} · ${created}` : filename;
}

function showOverlay() {
  $('player-overlay').classList.add('visible');
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    $('player-overlay').classList.remove('visible');
  }, 3500);
}

function waitForVideoReady(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video failed to load'));
    };
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function playItem(item) {
  const video = $('video');
  const baseUrl = item.mediaFile?.baseUrl;
  if (!baseUrl) throw new Error('Missing video URL');

  const status = item.mediaFile?.mediaFileMetadata?.videoMetadata?.processingStatus;
  if (status && status !== 'READY') {
    throw new Error(`Video still processing (${status})`);
  }

  $('loading').hidden = false;
  video.pause();
  video.src = buildStreamUrl(baseUrl);
  video.load();
  updateNowPlaying(item);

  try {
    await waitForVideoReady(video);
    await video.play();
  } finally {
    $('loading').hidden = true;
  }
}

async function playNextVideo() {
  if (!shuffleQueue || !isPlaying) return;

  let attempts = 0;
  const maxAttempts = Math.max(shuffleQueue.all.length, 1);

  while (attempts < maxAttempts) {
    attempts += 1;
    const item = shuffleQueue.next();

    try {
      await playItem(item);
      return;
    } catch (err) {
      console.warn('Skipping video', item.id, err.message);
    }
  }

  setStatus('Could not load any videos. Re-pick videos or run via the site server so /api/gphotos/media works.', true);
  showSetup();
}

class ShuffleQueue {
  constructor(items) {
    this.all = items;
    this.queue = [];
    this.index = 0;
    this.reshuffle();
  }

  reshuffle() {
    this.queue = [...this.all];
    for (let i = this.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.index = 0;
  }

  next() {
    if (this.index >= this.queue.length) this.reshuffle();
    return this.queue[this.index++];
  }
}

function stopPlayback() {
  isPlaying = false;
  const video = $('video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  shuffleQueue = null;
}

async function startPlayback() {
  setStatus('Loading your videos…');
  $('btn-start').disabled = true;

  try {
    await ensureSignedIn();
    const videos = await refreshVideosFromSession();

    if (!videos.length) {
      setStatus('No videos in your selection. Pick videos that include MP4/MOV files.', true);
      return;
    }

    shuffleQueue = new ShuffleQueue(videos);
    isPlaying = true;
    showPlayer();
    showOverlay();
    await playNextVideo();
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Could not start playback', true);
  } finally {
    $('btn-start').disabled = false;
  }
}

function updateLibrarySummary() {
  const library = loadLibrary();
  const summary = $('library-summary');

  if (!library?.videoCount) {
    summary.textContent = 'No videos picked yet.';
    $('btn-start').disabled = true;
    return;
  }

  const expires = library.expireTime
    ? new Date(library.expireTime).toLocaleString()
    : 'unknown';
  summary.textContent = `${library.videoCount} videos saved · session expires ${expires}`;
  $('btn-start').disabled = false;
}

function updateAuthSummary() {
  $('auth-summary').textContent = getToken()
    ? 'Signed in to Google'
    : 'Not signed in';
  $('btn-signin').hidden = !!getToken();
  $('btn-signout').hidden = !getToken();
}

function bindEvents() {
  $('btn-signin').addEventListener('click', async () => {
    try {
      await signIn(true);
      updateAuthSummary();
      setStatus('Signed in. Pick videos from Google Photos.');
    } catch (err) {
      setStatus(err.message || 'Sign-in failed', true);
    }
  });

  $('btn-signout').addEventListener('click', () => {
    sessionStorage.removeItem('gphotos_token');
    sessionStorage.removeItem('gphotos_token_exp');
    updateAuthSummary();
    setStatus('Signed out.');
  });

  $('btn-pick').addEventListener('click', pickVideos);
  $('btn-start').addEventListener('click', startPlayback);
  $('btn-clear').addEventListener('click', () => {
    clearLibrary();
    updateLibrarySummary();
    setStatus('Cleared saved selection.');
  });

  $('btn-skip').addEventListener('click', () => {
    playNextVideo();
    showOverlay();
  });

  $('btn-exit').addEventListener('click', showSetup);

  $('btn-fullscreen').addEventListener('click', async () => {
    const target = $('player-screen');
    if (!document.fullscreenElement) {
      await target.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
    showOverlay();
  });

  $('video').addEventListener('ended', () => {
    playNextVideo();
  });

  $('video').addEventListener('error', () => {
    playNextVideo();
  });

  $('player-screen').addEventListener('mousemove', showOverlay);
  $('player-screen').addEventListener('click', showOverlay);

  document.addEventListener('keydown', (event) => {
    if ($('player-screen').hidden) return;
    if (event.key === 'ArrowRight' || event.key === 'n' || event.key === 'N') {
      playNextVideo();
      showOverlay();
    }
    if (event.key === 'f' || event.key === 'F') {
      $('btn-fullscreen').click();
    }
    if (event.key === 'Escape' && !document.fullscreenElement) {
      showSetup();
    }
  });
}

export async function initPhotosPlayer() {
  await waitForGoogle();

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {},
  });

  bindEvents();
  updateAuthSummary();
  updateLibrarySummary();

  if (getToken()) {
    setStatus('Ready — pick videos or start playback.');
  } else {
    setStatus('Sign in with Google to get started.');
  }

  const originHint = $('origin-hint');
  if (originHint) {
    const origin = window.location.origin;
    const isFile = window.location.protocol === 'file:';
    originHint.innerHTML = isFile
      ? '<strong>OAuth will not work from a local file.</strong> Run <code>npm start</code> in HealthLuminateSite and open <code>http://localhost:3000/taylorsideproject/photos-player.html</code>, then add that origin in Google Cloud Console.'
      : `Add this exact origin in Google Cloud Console → Credentials → your OAuth client → <strong>Authorized JavaScript origins</strong>: <code>${origin}</code> (also add <code>http://localhost:3000</code> if testing locally). Changes can take a few minutes.`;
  }
}
