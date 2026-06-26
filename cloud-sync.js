(function () {
  const DEVICE_KEY = "dominique-os-device-id";
  const PUSH_DELAY_MS = 1200;
  const SUPABASE_MODULE_URL = "https://esm.sh/@supabase/supabase-js@2";

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
        <p class="cloud-auth-copy">输入允许访问的邮箱。系统会发送登录链接，浏览器不保存 Feishu 密钥或 service role key。</p>
        <label class="field-label" for="cloudEmail">Email</label>
        <input type="email" id="cloudEmail" autocomplete="email" required placeholder="your@email.com" />
        <button class="primary-button" type="submit">发送登录链接</button>
        <p class="cloud-auth-message" id="cloudAuthMessage"></p>
      </form>
    `;
    document.body.appendChild(overlayNode);
    overlayNode.querySelector("#cloudAuthForm").addEventListener("submit", sendLoginLink);
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

  async function sendLoginLink(event) {
    event.preventDefault();
    const emailInput = overlayNode.querySelector("#cloudEmail");
    const messageNode = overlayNode.querySelector("#cloudAuthMessage");
    const email = emailInput.value.trim();
    if (config.allowedEmail && email.toLowerCase() !== config.allowedEmail.toLowerCase()) {
      messageNode.textContent = "这个邮箱不在允许访问列表。";
      return;
    }
    setStatus("warning", "发送登录");
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) {
      messageNode.textContent = `登录链接发送失败：${error.message}`;
      setStatus("error", "登录失败");
      return;
    }
    messageNode.textContent = "登录链接已发送，请在邮箱中确认。";
    setStatus("warning", "查收邮件");
  }

  async function loadSupabaseClient() {
    if (window.supabase?.createClient) {
      return window.supabase.createClient;
    }
    const module = await import(SUPABASE_MODULE_URL);
    return module.createClient;
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
