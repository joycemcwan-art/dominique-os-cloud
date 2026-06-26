(function () {
  const DEVICE_KEY = "dominique-os-device-id";
  const SESSION_KEY = "dominique-os-supabase-session-v1";
  const PUSH_DELAY_MS = 1200;

  let config = null;
  let client = null;
  let app = null;
  let session = null;
  let pushTimer = null;
  let ready = false;
  let applyingRemote = false;
  let deviceId = "";
  let channel = null;
  let statusNode = null;
  let overlayNode = null;

  function cloudConfig() {
    const value = window.DOMINIQUE_OS_CLOUD || {};
    return {
      enabled: Boolean(value.enabled),
      provider: value.provider || "supabase",
      supabaseUrl: value.supabaseUrl || "",
      supabaseAnonKey: value.supabaseAnonKey || "",
      allowedEmail: value.allowedEmail || "",
      appName: value.appName || "Dominique OS"
    };
  }

  function getDeviceId() {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const generated = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}`;
    localStorage.setItem(DEVICE_KEY, generated);
    return generated;
  }

  function setStatus(mode, label) {
    if (statusNode) {
      statusNode.classList.remove("online", "warning", "error");
      statusNode.classList.add(mode);
      statusNode.querySelector("strong").textContent = label;
    }
    app?.onStatus?.({ mode, label });
  }

  function renderCloudStatus() {
    if (statusNode) return;
    const actions = document.querySelector(".topbar-actions");
    if (!actions) return;
    statusNode = document.createElement("button");
    statusNode.type = "button";
    statusNode.className = "cloud-badge warning";
    statusNode.innerHTML = "<span></span><strong>云端连接中</strong>";
    statusNode.addEventListener("click", async () => {
      if (!client) return;
      await client.auth.signOut();
      ready = false;
      session = null;
      showAuthOverlay("已退出云端账号。");
      setStatus("warning", "待登录");
    });
    actions.prepend(statusNode);
  }

  function renderAuthOverlay() {
    if (overlayNode) return overlayNode;
    overlayNode = document.createElement("div");
    overlayNode.className = "cloud-auth-overlay";
    overlayNode.innerHTML = `
      <form class="cloud-auth-card" id="cloudAuthForm">
        <p class="eyebrow">Private cloud access</p>
        <h2>登录 ${escapeHtml(config.appName)}</h2>
        <p class="cloud-auth-copy">输入允许访问的邮箱。密码登录不依赖邮件发送；邮件链接作为备用方式。</p>
        <label class="field-label" for="cloudEmail">Email</label>
        <input type="email" id="cloudEmail" autocomplete="email" required placeholder="your@email.com" />
        <label class="field-label" for="cloudPassword">Password</label>
        <input type="password" id="cloudPassword" autocomplete="current-password" placeholder="Supabase login password" />
        <button class="primary-button" type="submit">密码登录</button>
        <button class="cloud-link-button" id="sendMagicLinkBtn" type="button">发送登录链接</button>
        <p class="cloud-auth-message" id="cloudAuthMessage"></p>
      </form>
    `;
    document.body.appendChild(overlayNode);
    overlayNode.querySelector("#cloudAuthForm").addEventListener("submit", signInWithPassword);
    overlayNode.querySelector("#sendMagicLinkBtn").addEventListener("click", sendLoginLink);
    return overlayNode;
  }

  function showAuthOverlay(message = "") {
    const overlay = renderAuthOverlay();
    overlay.hidden = false;
    const messageNode = overlay.querySelector("#cloudAuthMessage");
    messageNode.textContent = message;
  }

  function hideAuthOverlay() {
    if (overlayNode) {
      overlayNode.hidden = true;
    }
  }

  function readAuthForm() {
    const emailInput = overlayNode.querySelector("#cloudEmail");
    const passwordInput = overlayNode.querySelector("#cloudPassword");
    const messageNode = overlayNode.querySelector("#cloudAuthMessage");
    const email = emailInput.value.trim();
    if (config.allowedEmail && email.toLowerCase() !== config.allowedEmail.toLowerCase()) {
      messageNode.textContent = "这个邮箱不在允许访问列表。";
      return null;
    }
    return { email, password: passwordInput.value, messageNode };
  }

  async function signInWithPassword(event) {
    event.preventDefault();
    const form = readAuthForm();
    if (!form) return;
    if (!form.password) {
      form.messageNode.textContent = "请输入密码。";
      return;
    }
    setStatus("warning", "登录中");
    const { error } = await client.auth.signInWithPassword({
      email: form.email,
      password: form.password
    });
    if (error) {
      form.messageNode.textContent = `密码登录失败：${error.message}`;
      setStatus("error", "登录失败");
      return;
    }
    form.messageNode.textContent = "登录成功，正在同步云端状态。";
    setStatus("online", "云端已登录");
  }

  async function sendLoginLink(event) {
    event.preventDefault();
    const form = readAuthForm();
    if (!form) return;
    setStatus("warning", "发送登录");
    const { error } = await client.auth.signInWithOtp({
      email: form.email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
        shouldCreateUser: false
      }
    });
    if (error) {
      form.messageNode.textContent = `登录链接发送失败：${error.message}`;
      setStatus("error", "登录失败");
      return;
    }
    form.messageNode.textContent = "登录链接已发送，请在邮箱中确认。";
    setStatus("warning", "查收邮件");
  }

  async function loadSupabaseClient() {
    if (window.supabase?.createClient) {
      return window.supabase.createClient;
    }
    return createFetchSupabaseClient;
  }

  function createFetchSupabaseClient(supabaseUrl, anonKey) {
    const baseUrl = supabaseUrl.replace(/\/$/, "");
    const listeners = new Set();

    function notify(event, nextSession) {
      listeners.forEach((listener) => {
        listener(event, nextSession);
      });
    }

    function projectRef() {
      try {
        return new URL(baseUrl).hostname.split(".")[0];
      } catch {
        return "";
      }
    }

    function normalizeSession(payload) {
      if (!payload?.access_token) return null;
      return {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token || "",
        token_type: payload.token_type || "bearer",
        expires_in: payload.expires_in || 3600,
        expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
        user: payload.user || null
      };
    }

    function saveSession(nextSession) {
      if (!nextSession) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    }

    function readStoredSession() {
      const keys = [
        SESSION_KEY,
        `sb-${projectRef()}-auth-token`
      ].filter(Boolean);
      for (const key of keys) {
        try {
          const value = JSON.parse(localStorage.getItem(key) || "null");
          const nextSession = normalizeSession(value?.currentSession || value);
          if (nextSession) return nextSession;
        } catch {
          // Ignore malformed browser auth cache entries.
        }
      }
      return null;
    }

    function readUrlSession() {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      if (!hash) return null;
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      if (!accessToken) return null;
      const nextSession = normalizeSession({
        access_token: accessToken,
        refresh_token: params.get("refresh_token") || "",
        token_type: params.get("token_type") || "bearer",
        expires_in: Number(params.get("expires_in") || 3600),
        expires_at: Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
        user: null
      });
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      return nextSession;
    }

    async function requestJson(path, { method = "GET", body = null, token = null, prefer = "" } = {}) {
      const headers = {
        apikey: anonKey,
        Accept: "application/json",
        "Content-Type": "application/json"
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (prefer) headers.Prefer = prefer;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body == null ? null : JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        if (!response.ok) {
          throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `Supabase ${response.status}`);
        }
        return data;
      } catch (error) {
        if (error.name === "AbortError") {
          throw new Error("Supabase request timed out");
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    async function refreshSession(current) {
      if (!current?.refresh_token) return null;
      const refreshed = await requestJson("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: current.refresh_token }
      });
      const nextSession = normalizeSession(refreshed);
      saveSession(nextSession);
      return nextSession;
    }

    async function currentSession() {
      let nextSession = readUrlSession() || readStoredSession();
      if (!nextSession) return null;
      if (nextSession.expires_at && nextSession.expires_at < Math.floor(Date.now() / 1000) + 60) {
        nextSession = await refreshSession(nextSession);
      }
      if (!nextSession?.user && nextSession?.access_token) {
        const userResult = await requestJson("/auth/v1/user", {
          token: nextSession.access_token
        });
        nextSession.user = userResult;
        saveSession(nextSession);
      }
      return nextSession;
    }

    function from(table) {
      const builder = {
        columns: "*",
        filters: [],
        select(columns) {
          this.columns = columns || "*";
          return this;
        },
        eq(field, value) {
          this.filters.push([field, value]);
          return this;
        },
        async maybeSingle() {
          try {
            const nextSession = await currentSession();
            if (!nextSession) throw new Error("Not signed in");
            const params = new URLSearchParams({ select: this.columns });
            this.filters.forEach(([field, value]) => {
              params.set(field, `eq.${value}`);
            });
            const rows = await requestJson(`/rest/v1/${table}?${params.toString()}`, {
              token: nextSession.access_token
            });
            return { data: rows?.[0] || null, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
        async upsert(payload, options = {}) {
          try {
            const nextSession = await currentSession();
            if (!nextSession) throw new Error("Not signed in");
            const conflict = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : "";
            await requestJson(`/rest/v1/${table}${conflict}`, {
              method: "POST",
              body: payload,
              token: nextSession.access_token,
              prefer: "resolution=merge-duplicates,return=minimal"
            });
            return { error: null };
          } catch (error) {
            return { error };
          }
        },
        async insert(payload) {
          try {
            const nextSession = await currentSession();
            if (!nextSession) throw new Error("Not signed in");
            await requestJson(`/rest/v1/${table}`, {
              method: "POST",
              body: payload,
              token: nextSession.access_token,
              prefer: "return=minimal"
            });
            return { error: null };
          } catch (error) {
            return { error };
          }
        }
      };
      return builder;
    }

    return {
      auth: {
        async getSession() {
          const nextSession = await currentSession();
          return { data: { session: nextSession }, error: null };
        },
        async signInWithPassword({ email, password }) {
          try {
            const result = await requestJson("/auth/v1/token?grant_type=password", {
              method: "POST",
              body: { email, password }
            });
            const nextSession = normalizeSession(result);
            saveSession(nextSession);
            notify("SIGNED_IN", nextSession);
            return { data: { session: nextSession }, error: null };
          } catch (error) {
            return { data: { session: null }, error };
          }
        },
        async signInWithOtp({ email, options = {} }) {
          try {
            await requestJson("/auth/v1/otp", {
              method: "POST",
              token: anonKey,
              body: {
                email,
                create_user: false,
                options: {
                  email_redirect_to: options.emailRedirectTo || window.location.href,
                  should_create_user: false
                }
              }
            });
            return { error: null };
          } catch (error) {
            return { error };
          }
        },
        async signOut() {
          saveSession(null);
          notify("SIGNED_OUT", null);
          return { error: null };
        },
        onAuthStateChange(listener) {
          listeners.add(listener);
          return {
            data: {
              subscription: {
                unsubscribe: () => listeners.delete(listener)
              }
            }
          };
        }
      },
      from,
      channel() {
        return {
          on() {
            return this;
          },
          subscribe() {
            return this;
          }
        };
      },
      removeChannel() {}
    };
  }

  async function ensureSession() {
    const result = await client.auth.getSession();
    session = result.data.session;
    if (!session) {
      showAuthOverlay("需要登录后访问云端 OS。");
      setStatus("warning", "待登录");
      return false;
    }
    const email = session.user?.email || "";
    if (config.allowedEmail && email.toLowerCase() !== config.allowedEmail.toLowerCase()) {
      await client.auth.signOut();
      session = null;
      showAuthOverlay("当前账号不在允许访问列表。");
      setStatus("error", "账号不匹配");
      return false;
    }
    hideAuthOverlay();
    return true;
  }

  async function pullCloudState() {
    const userId = session.user.id;
    const { data, error } = await client
      .from("os_states")
      .select("state,revision,updated_at,updated_by_device")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data?.state) {
      applyingRemote = true;
      app.setState(data.state);
      applyingRemote = false;
      await pushNow("merge_after_pull");
      return;
    }
    await pushNow("initial_create");
  }

  async function pushNow(reason = "state_update") {
    if (!ready || !session || applyingRemote) return;
    const currentState = app.getState();
    const nextState = {
      ...currentState,
      meta: {
        ...(currentState.meta || {}),
        cloudUpdatedAt: new Date().toISOString(),
        cloudDeviceId: deviceId
      }
    };
    const userId = session.user.id;
    const { data: existing, error: readError } = await client
      .from("os_states")
      .select("revision")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    const revision = Number(existing?.revision || 0) + 1;
    const { error: writeError } = await client
      .from("os_states")
      .upsert({
        user_id: userId,
        state: nextState,
        revision,
        updated_by_device: deviceId
      }, { onConflict: "user_id" });
    if (writeError) throw writeError;
    await client.from("os_sync_events").insert({
      user_id: userId,
      device_id: deviceId,
      event_type: reason,
      entity_key: "os_state",
      payload: { revision }
    });
    setStatus("online", "云端已同步");
  }

  function schedulePush() {
    if (!ready || applyingRemote) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => {
      pushNow().catch((error) => {
        setStatus("error", "云同步失败");
        console.warn("Dominique OS cloud push failed", error);
      });
    }, PUSH_DELAY_MS);
  }

  function subscribeRemoteChanges() {
    if (!session) return;
    if (channel) {
      client.removeChannel(channel);
    }
    channel = client
      .channel(`dominique-os-state-${session.user.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "os_states",
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        const row = payload.new || {};
        if (!row.state || row.updated_by_device === deviceId) return;
        applyingRemote = true;
        app.setState(row.state);
        applyingRemote = false;
        setStatus("online", "云端已更新");
      })
      .subscribe();
  }

  async function init(appApi) {
    config = cloudConfig();
    if (!config.enabled) return false;
    if (config.provider !== "supabase") {
      throw new Error(`Unsupported cloud provider: ${config.provider}`);
    }
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Missing Supabase cloud config");
    }
    app = appApi;
    deviceId = getDeviceId();
    renderCloudStatus();
    setStatus("warning", "云端连接中");
    const createClient = await loadSupabaseClient();
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    client.auth.onAuthStateChange(async (_event, nextSession) => {
      session = nextSession;
      if (!session) {
        ready = false;
        showAuthOverlay("需要登录后访问云端 OS。");
        return;
      }
      if (await ensureSession()) {
        ready = true;
        setStatus("online", "云端已登录");
        await pullCloudState();
        subscribeRemoteChanges();
      }
    });
    if (!(await ensureSession())) return false;
    ready = true;
    await pullCloudState();
    subscribeRemoteChanges();
    setStatus("online", "云端已同步");
    return true;
  }

  function isReady() {
    return ready;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.DominiqueOSCloud = {
    init,
    isReady,
    schedulePush
  };
})();
