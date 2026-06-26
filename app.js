const STORAGE_KEY = "dominique-os-state-v1";
const STATE_SCHEMA_VERSION = 3;
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:8799" : "";
const LEGACY_RECOVERY_STATUS = "已完成（根据本轮反馈恢复）";

const domains = {
  body: {
    name: "身体",
    color: "#d83b33",
    tone: "红",
    definition: "肉身的健康，包括运动、按摩放松、健康管理等。",
    goal: "稳定的运动习惯，舒展的身体状态。"
  },
  sound: {
    name: "声音",
    color: "#df7a24",
    tone: "橙",
    definition: "对声音及疗愈结合的理解，包括学习乐理、演奏、准备与艺术疗愈有关的事情。",
    goal: "在声音之中，理解声音，运用声音，阶段性完成 HKU 项目的申请。"
  },
  world: {
    name: "世界",
    color: "#c59a1c",
    tone: "黄",
    definition: "观测世界的变化、职业的变化，完成与世界的交互、获得财务的回报。",
    goal: "感知世界的变化，在世界的变化中行动。"
  },
  relation: {
    name: "关系",
    color: "#2f9b68",
    tone: "绿",
    definition: "与家人、朋友、项目伙伴、投资人和潜在合作对象的关系维护。",
    goal: "在家人与朋友的关系之中，爱与被爱。"
  },
  language: {
    name: "语言",
    color: "#0096a7",
    tone: "青",
    definition: "对英语的使用，包括读、听、说。",
    goal: "把英语当成一种自然而然理解世界的方式。"
  },
  rugoan: {
    name: "如观",
    color: "#3c6df0",
    tone: "蓝",
    definition: "每天早晚的经典内容输入，包括通过听、读、看的方式。",
    goal: "打开看待世界的维度，从立体而非偏见的视角观察这个世界。"
  },
  meditation: {
    name: "禅修",
    color: "#8754d8",
    tone: "紫",
    definition: "每天早晚的铜锣冥想。",
    goal: "每时每刻都是冥想，早和晚的调频。"
  }
};

const route = [
  { id: "ruguan-am", domain: "rugoan", label: "如观", step: "第 1 站", x: 12, y: 25 },
  { id: "meditation-am", domain: "meditation", label: "禅修", step: "第 2 站", x: 30, y: 14 },
  { id: "language", domain: "language", label: "语言", step: "第 3 站", x: 50, y: 18 },
  { id: "sound", domain: "sound", label: "声音", step: "第 4 站", x: 69, y: 29 },
  { id: "world", domain: "world", label: "世界", step: "第 5 站", x: 83, y: 48 },
  { id: "body", domain: "body", label: "身体", step: "第 6 站", x: 68, y: 69 },
  { id: "relation", domain: "relation", label: "关系", step: "第 7 站", x: 49, y: 78 },
  { id: "meditation-pm", domain: "meditation", label: "禅修", step: "第 8 站", x: 29, y: 68 },
  { id: "ruguan-pm", domain: "rugoan", label: "如观", step: "第 9 站", x: 12, y: 51 }
];

const quotes = [
  { text: "知人者智，自知者明。", source: "《道德经》第三十三章" },
  { text: "应无所住，而生其心。", source: "《金刚经》" },
  { text: "吾日三省吾身。", source: "《论语 学而》" },
  { text: "认识你自己。", source: "德尔斐神庙箴言" },
  { text: "人不是被事情困扰，而是被对事情的看法困扰。", source: "爱比克泰德《手册》" },
  { text: "在你站立的地方，挖深井。", source: "禅宗语录" },
  { text: "凡是真实的生活，都是相遇。", source: "马丁 布伯《我与你》" },
  { text: "教育不是注满一桶水，而是点燃一把火。", source: "普鲁塔克传统引文" }
];

const routines = [
  { id: "news", title: "新闻", subtitle: "世界变化与下一步追踪", color: domains.world.color },
  { id: "prediction", title: "预测市场", subtitle: "概率信号与重大事件", color: domains.language.color },
  { id: "stock", title: "选股", subtitle: "二级市场观察与组合纪律", color: domains.body.color },
  { id: "primary", title: "一级市场", subtitle: "项目、融资、商业模式", color: domains.sound.color }
];

const relationSegments = [
  { id: "project", title: "项目侧" },
  { id: "investor", title: "投资人侧" },
  { id: "stars", title: "Stars" }
];

let state = loadState();
const initialRoute = readInitialRoute();
let activeView = initialRoute.view;
let selectedDateKey = initialRoute.date;
let selectedNodeId = route[0].id;
let syncState = {
  serverOnline: false,
  feishu: null,
  timeRecords: [],
  automation: {},
  relationSuggestions: null,
  lastSyncAt: ""
};
let statePushTimer = null;

function loadState() {
  const fallback = {
    meta: {
      schemaVersion: STATE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString()
    },
    days: {},
    relationPlan: createEmptyRelationPlan(),
    feishuCalendar: createEmptyFeishuCalendar()
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(parsed || fallback);
  } catch {
    return fallback;
  }
}

function normalizeState(input) {
  const base = {
    meta: {
      schemaVersion: STATE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString()
    },
    days: {},
    relationPlan: createEmptyRelationPlan()
  };
  const normalized = {
    ...base,
    ...(input || {}),
    meta: {
      ...base.meta,
      ...((input || {}).meta || {}),
      schemaVersion: STATE_SCHEMA_VERSION
    },
    days: {
      ...((input || {}).days || {})
    },
    relationPlan: {
      ...createEmptyRelationPlan(),
      ...((input || {}).relationPlan || {})
    },
    feishuCalendar: normalizeFeishuCalendar((input || {}).feishuCalendar)
  };
  relationSegments.forEach((segment) => {
    const rows = Array.isArray(normalized.relationPlan[segment.id]) ? normalized.relationPlan[segment.id] : [];
    normalized.relationPlan[segment.id] = Array.from({ length: 10 }, (_, index) => ({
      done: Boolean(rows[index]?.done),
      name: rows[index]?.name || "",
      manual: Boolean(rows[index]?.manual),
      source: rows[index]?.source || "",
      reason: rows[index]?.reason || ""
    }));
  });
  return normalized;
}

function writeLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  state.meta = {
    ...(state.meta || {}),
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };
  writeLocalState();
  scheduleStatePush();
  scheduleCloudPush();
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readInitialRoute() {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");
  const view = params.get("view");
  const views = new Set(["map", "calendar", "domains", "world"]);
  return {
    date: isDateKey(date) ? date : (isDateKey(state.meta?.selectedDate) ? state.meta.selectedDate : todayKey()),
    view: views.has(view) ? view : "map"
  };
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key, delta) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + delta);
  return formatDate(date);
}

function selectedDay() {
  return ensureDay(selectedDateKey);
}

function ensureDay(key = selectedDateKey) {
  if (!state.days[key]) {
    state.days[key] = {
      route: {},
      routines: {},
      projects: [],
      weeklyReport: ""
    };
  }

  route.forEach((node) => {
    if (!state.days[key].route[node.id]) {
      state.days[key].route[node.id] = { done: false, status: "" };
    } else {
      state.days[key].route[node.id] = cleanRouteEntry(state.days[key].route[node.id]);
    }
  });

  routines.forEach((routine) => {
    if (!state.days[key].routines[routine.id]) {
      state.days[key].routines[routine.id] = { done: false, link: "", note: "" };
    }
  });

  return state.days[key];
}

function createEmptyRelationPlan() {
  return relationSegments.reduce((acc, segment) => {
    acc[segment.id] = Array.from({ length: 10 }, () => ({ done: false, name: "", manual: false, source: "", reason: "" }));
    return acc;
  }, {});
}

function createEmptyFeishuCalendar() {
  return {
    months: {},
    updatedAt: ""
  };
}

function normalizeFeishuCalendar(input) {
  const calendar = createEmptyFeishuCalendar();
  const months = input?.months && typeof input.months === "object" ? input.months : {};
  Object.entries(months).forEach(([month, value]) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const records = Array.isArray(value?.records) ? value.records.map(normalizeTimeRecord).filter(Boolean) : [];
    calendar.months[month] = {
      source: value?.source || "feishu",
      start: value?.start || `${month}-01`,
      end: value?.end || "",
      syncedAt: value?.syncedAt || input?.updatedAt || "",
      records: dedupeTimeRecords(records)
    };
  });
  calendar.updatedAt = input?.updatedAt || latestCalendarSync(calendar) || "";
  return calendar;
}

function normalizeTimeRecord(record) {
  if (!record || typeof record !== "object" || !isDateKey(record.date)) return null;
  return {
    id: String(record.id || `${record.date}:${record.startTime || ""}:${record.title || record.eventType || ""}`),
    title: String(record.title || ""),
    eventType: String(record.eventType || ""),
    domain: String(record.domain || "world"),
    startMs: Number.isFinite(Number(record.startMs)) ? Number(record.startMs) : null,
    endMs: Number.isFinite(Number(record.endMs)) ? Number(record.endMs) : null,
    date: record.date,
    startTime: String(record.startTime || ""),
    endTime: String(record.endTime || ""),
    goal: String(record.goal || ""),
    description: String(record.description || ""),
    doc: normalizeDocLink(record.doc)
  };
}

function normalizeDocLink(doc) {
  if (!doc || typeof doc !== "object") return null;
  const url = String(doc.url || doc.link || "");
  const title = String(doc.title || doc.text || url || "");
  return url || title ? { title, url } : null;
}

function dedupeTimeRecords(records) {
  const seen = new Set();
  return records
    .filter((record) => {
      const key = record.id || `${record.date}:${record.startTime}:${record.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if ((a.startMs || 0) !== (b.startMs || 0)) return (a.startMs || 0) - (b.startMs || 0);
      return `${a.startTime} ${a.title}`.localeCompare(`${b.startTime} ${b.title}`, "zh-CN");
    });
}

function latestCalendarSync(calendar) {
  return Object.values(calendar.months || {})
    .map((month) => month.syncedAt || "")
    .sort()
    .at(-1) || "";
}

async function init() {
  ensureDay(selectedDateKey);
  setDates();
  renderRoute();
  renderQuote();
  renderNodeEditor();
  renderCalendar();
  renderDomains();
  renderWorld();
  bindEvents();
  switchView(activeView);
  refreshIcons();
  await restoreStateFromServer();
  await loadRemoteData(false);
  await initCloudSync();
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function initCloudSync() {
  if (!window.DominiqueOSCloud?.init) return false;
  try {
    return await window.DominiqueOSCloud.init({
      getState: () => state,
      setState: applyExternalState,
      onStatus: ({ mode, label }) => updateSyncIndicator(mode, label)
    });
  } catch (error) {
    updateSyncIndicator("error", "云配置错误");
    console.warn("Dominique OS cloud sync failed to initialize", error);
    return false;
  }
}

function applyExternalState(incoming) {
  state = mergeStates(normalizeState(incoming), state);
  selectedDateKey = isDateKey(state.meta?.selectedDate) ? state.meta.selectedDate : selectedDateKey;
  ensureDay(selectedDateKey);
  hydrateTimeRecordsFromState();
  writeLocalState();
  setDates();
  renderQuote();
  renderAll();
}

function setDates() {
  const selectedDate = dateFromKey(selectedDateKey);
  const label = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(selectedDate);
  document.getElementById("todayLabel").textContent = label;
  document.getElementById("sidebarDate").textContent = selectedDateKey;
  document.getElementById("activeDateInput").value = selectedDateKey;
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.getElementById("prevDateBtn").addEventListener("click", () => setSelectedDate(addDays(selectedDateKey, -1)));
  document.getElementById("nextDateBtn").addEventListener("click", () => setSelectedDate(addDays(selectedDateKey, 1)));
  document.getElementById("todayDateBtn").addEventListener("click", () => setSelectedDate(todayKey()));
  document.getElementById("activeDateInput").addEventListener("change", (event) => {
    setSelectedDate(event.target.value);
  });

  document.getElementById("nodeDone").addEventListener("change", updateSelectedNode);
  document.getElementById("nodeStatus").addEventListener("input", updateSelectedNode);
  document.getElementById("saveNodeBtn").addEventListener("click", () => {
    updateSelectedNode();
    renderAll();
  });
  document.getElementById("clearNodeBtn").addEventListener("click", clearSelectedNode);
  document.getElementById("resetTodayBtn").addEventListener("click", resetToday);
  document.getElementById("syncFeishuBtn").addEventListener("click", () => loadRemoteData(true));
  document.getElementById("writeFeishuBtn").addEventListener("click", syncTodayToFeishu);
  document.getElementById("addProjectBtn").addEventListener("click", addProjectEntry);
  document.getElementById("generateReportBtn").addEventListener("click", generateWeeklyReport);
}

function setSelectedDate(key, { loadRemote = true } = {}) {
  if (!isDateKey(key)) return;
  selectedDateKey = key;
  ensureDay(selectedDateKey);
  state.meta = {
    ...(state.meta || {}),
    schemaVersion: STATE_SCHEMA_VERSION,
    selectedDate: selectedDateKey
  };
  writeLocalState();
  scheduleCloudPush();
  syncState.timeRecords = [];
  hydrateTimeRecordsFromState();
  syncState.automation = {};
  setDates();
  renderQuote();
  renderAll();
  if (loadRemote) {
    loadRemoteData(false);
  }
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  const title = document.getElementById(`${view}View`).dataset.title;
  document.getElementById("viewTitle").textContent = title;
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { "Accept": "application/json" } });
  const data = await response.json();
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `API ${response.status}`);
  }
  return data;
}

async function apiPost(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `API ${response.status}`);
  }
  return data;
}

async function restoreStateFromServer() {
  try {
    const saved = await apiGet("/api/os-state");
    const remote = extractSavedState(saved);
    if (!remote) return false;
    state = mergeStates(remote, state);
    selectedDateKey = isDateKey(state.meta?.selectedDate) ? state.meta.selectedDate : selectedDateKey;
    ensureDay(selectedDateKey);
    hydrateTimeRecordsFromState();
    writeLocalState();
    setDates();
    renderAll();
    updateSyncIndicator("online", "已恢复");
    return true;
  } catch {
    return false;
  }
}

function extractSavedState(saved) {
  const candidate = saved?.payload?.state || saved?.state || saved?.payload;
  if (!candidate || typeof candidate !== "object") return null;
  if (!candidate.days && !candidate.relationPlan) return null;
  return normalizeState(candidate);
}

function mergeStates(remote, local) {
  const merged = normalizeState(remote);
  const localState = normalizeState(local);

  Object.entries(localState.days || {}).forEach(([date, localDay]) => {
    const remoteDay = merged.days[date] || {};
    merged.days[date] = mergeDay(remoteDay, localDay);
  });

  relationSegments.forEach((segment) => {
    const remoteRows = merged.relationPlan[segment.id] || [];
    const localRows = localState.relationPlan[segment.id] || [];
    merged.relationPlan[segment.id] = Array.from({ length: 10 }, (_, index) => {
      const remoteRow = remoteRows[index] || { done: false, name: "", manual: false, source: "", reason: "" };
      const localRow = localRows[index] || { done: false, name: "", manual: false, source: "", reason: "" };
      return hasRelationContent(localRow) ? localRow : remoteRow;
    });
  });

  merged.feishuCalendar = mergeFeishuCalendars(remote.feishuCalendar, localState.feishuCalendar);
  merged.meta = {
    ...(remote.meta || {}),
    selectedDate: localState.meta?.selectedDate || remote.meta?.selectedDate || selectedDateKey,
    schemaVersion: STATE_SCHEMA_VERSION,
    restoredAt: new Date().toISOString()
  };
  return merged;
}

function mergeFeishuCalendars(remoteCalendar, localCalendar) {
  const remote = normalizeFeishuCalendar(remoteCalendar);
  const local = normalizeFeishuCalendar(localCalendar);
  const merged = createEmptyFeishuCalendar();
  const months = new Set([
    ...Object.keys(remote.months || {}),
    ...Object.keys(local.months || {})
  ]);
  months.forEach((month) => {
    const remoteMonth = remote.months[month] || {};
    const localMonth = local.months[month] || {};
    const records = dedupeTimeRecords([
      ...(localMonth.records || []),
      ...(remoteMonth.records || [])
    ]);
    merged.months[month] = {
      source: localMonth.source || remoteMonth.source || "feishu",
      start: localMonth.start || remoteMonth.start || `${month}-01`,
      end: localMonth.end || remoteMonth.end || "",
      syncedAt: [localMonth.syncedAt || "", remoteMonth.syncedAt || ""].sort().at(-1) || "",
      records
    };
  });
  merged.updatedAt = latestCalendarSync(merged);
  return merged;
}

function mergeDay(remoteDay, localDay) {
  const merged = {
    route: {},
    routines: {},
    projects: [],
    weeklyReport: remoteDay.weeklyReport || "",
    ...remoteDay
  };

  route.forEach((node) => {
    const remoteEntry = cleanRouteEntry(remoteDay.route?.[node.id] || { done: false, status: "" });
    const localEntry = cleanRouteEntry(localDay.route?.[node.id] || { done: false, status: "" });
    merged.route[node.id] = hasRouteContent(localEntry) ? localEntry : remoteEntry;
  });

  routines.forEach((routine) => {
    const remoteEntry = remoteDay.routines?.[routine.id] || { done: false, link: "", note: "" };
    const localEntry = localDay.routines?.[routine.id] || { done: false, link: "", note: "" };
    merged.routines[routine.id] = hasRoutineContent(localEntry) ? localEntry : remoteEntry;
  });

  const seenProjects = new Set();
  merged.projects = [...(localDay.projects || []), ...(remoteDay.projects || [])].filter((item) => {
    const key = item.id || `${item.createdAt}:${item.text}`;
    if (seenProjects.has(key)) return false;
    seenProjects.add(key);
    return true;
  });
  merged.weeklyReport = localDay.weeklyReport || remoteDay.weeklyReport || "";
  return merged;
}

function hasRouteContent(entry) {
  return Boolean(entry?.done || cleanStatus(entry?.status));
}

function hasRoutineContent(entry) {
  return Boolean(entry?.done || entry?.link || entry?.note);
}

function hasRelationContent(entry) {
  return Boolean(entry?.done || entry?.name);
}

function cleanRouteEntry(entry) {
  return {
    done: Boolean(entry?.done),
    status: cleanStatus(entry?.status)
  };
}

function cleanStatus(value) {
  const text = String(value || "").trim();
  return text === LEGACY_RECOVERY_STATUS ? "" : text;
}

async function loadRemoteData(refresh = false) {
  const requestedDateKey = selectedDateKey;
  const requestedMonthRange = monthRangeQuery();
  updateSyncIndicator("warning", refresh ? "同步中" : "连接中");
  const requests = {
    status: apiGet("/api/status"),
    timeData: apiGet(`/api/feishu/time?${requestedMonthRange}${refresh ? "&refresh=1" : ""}`),
    automation: apiGet(`/api/automation/status?date=${requestedDateKey}`),
    relations: apiGet(`/api/relations/suggestions${refresh ? "?refresh=1" : ""}`)
  };

  const results = Object.fromEntries(await Promise.all(
    Object.entries(requests).map(async ([key, promise]) => {
      try {
        return [key, { ok: true, value: await promise }];
      } catch (error) {
        return [key, { ok: false, error }];
      }
    })
  ));

  const hasAnySuccess = Object.values(results).some((result) => result.ok);
  if (requestedDateKey !== selectedDateKey) {
    return;
  }
  if (!hasAnySuccess) {
    syncState.serverOnline = false;
    hydrateTimeRecordsFromState();
    updateFeishuStatus(results.status?.error || new Error("local API unavailable"));
    renderCalendar();
    updateSyncIndicator(syncState.timeRecords.length ? "online" : "error", syncState.timeRecords.length ? "云端缓存" : "本地模式");
    return;
  }

  syncState.serverOnline = true;

  if (results.status.ok) {
    syncState.feishu = results.status.value.feishu;
    syncState.lastSyncAt = results.status.value.serverTime || syncState.lastSyncAt;
  }
  if (results.timeData.ok) {
    syncState.timeRecords = results.timeData.value.records || [];
    syncState.lastSyncAt = results.timeData.value.syncedAt || syncState.lastSyncAt;
    cacheFeishuTimeData(results.timeData.value);
  } else {
    hydrateTimeRecordsFromState();
  }
  if (results.automation.ok) {
    syncState.automation = Object.fromEntries((results.automation.value.items || []).map((item) => [item.id, item]));
  }
  if (results.relations.ok) {
    syncState.relationSuggestions = results.relations.value.items || null;
  }

  try {
    updateFeishuStatus();
    mergeRelationSuggestions();
    renderAll();
    updateSyncIndicator(syncState.feishu?.ok ? "online" : "warning", syncState.feishu?.ok ? "已同步" : "本地服务");
    pushStateToServer();
  } catch (error) {
    updateSyncIndicator("error", "渲染失败");
  }
}

function monthRangeQuery() {
  const selectedDate = dateFromKey(selectedDateKey);
  const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
  return `start=${formatDate(start)}&end=${formatDate(end)}`;
}

function selectedMonthKey() {
  return selectedDateKey.slice(0, 7);
}

function getCachedMonthRecords(key = selectedDateKey) {
  const month = String(key).slice(0, 7);
  return state.feishuCalendar?.months?.[month]?.records || [];
}

function hydrateTimeRecordsFromState() {
  syncState.timeRecords = getCachedMonthRecords(selectedDateKey);
  const cachedMonth = state.feishuCalendar?.months?.[selectedMonthKey()];
  if (cachedMonth?.syncedAt) {
    syncState.lastSyncAt = cachedMonth.syncedAt;
  }
}

function cacheFeishuTimeData(timeData) {
  const records = Array.isArray(timeData?.records) ? timeData.records.map(normalizeTimeRecord).filter(Boolean) : [];
  if (!records.length) return;
  const nextCalendar = normalizeFeishuCalendar(state.feishuCalendar);
  const byMonth = records.reduce((acc, record) => {
    const month = record.date.slice(0, 7);
    acc[month] = acc[month] || [];
    acc[month].push(record);
    return acc;
  }, {});
  Object.entries(byMonth).forEach(([month, monthRecords]) => {
    const existing = nextCalendar.months[month] || {};
    nextCalendar.months[month] = {
      source: "feishu",
      start: timeData.start || existing.start || `${month}-01`,
      end: timeData.end || existing.end || "",
      syncedAt: timeData.syncedAt || existing.syncedAt || new Date().toISOString(),
      records: dedupeTimeRecords([
        ...monthRecords,
        ...(existing.records || [])
      ])
    };
  });
  nextCalendar.updatedAt = latestCalendarSync(nextCalendar) || new Date().toISOString();
  state.feishuCalendar = nextCalendar;
  writeLocalState();
  scheduleCloudPush();
}

function updateSyncIndicator(mode, label) {
  const indicator = document.getElementById("syncIndicator");
  indicator.classList.remove("online", "warning", "error");
  indicator.classList.add(mode);
  indicator.querySelector("strong").textContent = label;
}

function updateFeishuStatus(error = null) {
  const title = document.getElementById("feishuStatusTitle");
  const meta = document.getElementById("feishuStatusMeta");
  const monthBadge = document.getElementById("monthSyncBadge");
  const routineBadge = document.getElementById("routineSyncBadge");
  const relationBadge = document.getElementById("relationSyncBadge");

  if (error) {
    const cachedMonth = state.feishuCalendar?.months?.[selectedMonthKey()];
    const count = syncState.timeRecords.length;
    title.textContent = count ? "云端缓存已连接" : "未连接本地同步服务";
    meta.textContent = count
      ? `个人数据库 / 时间 · 云端缓存 ${count} 条 · ${cachedMonth?.syncedAt ? cachedMonth.syncedAt.slice(0, 16).replace("T", " ") : "等待本机刷新"}`
      : "本地服务开启后自动同步";
    monthBadge.textContent = count ? "飞书云端缓存" : "飞书待同步";
    monthBadge.classList.toggle("pending", !count);
    routineBadge.textContent = "本地";
    relationBadge.textContent = "项目库 / 机构库 / Stars 待读取";
    relationBadge.classList.add("pending");
    return;
  }

  const count = syncState.timeRecords.length;
  const userName = syncState.feishu?.user?.name || syncState.feishu?.user?.en_name || "Feishu";
  title.textContent = syncState.feishu?.ok ? `已授权：${userName}` : "本地服务已连接";
  meta.textContent = count ? `个人数据库 / 时间 · ${count} 条本月记录` : "个人数据库 / 时间 · 本月暂无记录";
  monthBadge.textContent = count ? "飞书已同步" : "飞书无本月记录";
  monthBadge.classList.toggle("pending", !syncState.feishu?.ok);
  routineBadge.textContent = "Codex 证据";
  relationBadge.textContent = syncState.relationSuggestions ? "项目库 / 机构库 / Stars" : "待同步";
  relationBadge.classList.toggle("pending", !syncState.relationSuggestions);
}

function mergeRelationSuggestions() {
  if (!syncState.relationSuggestions) return;
  let changed = false;
  relationSegments.forEach((segment) => {
    const rows = state.relationPlan[segment.id] || [];
    const suggestions = syncState.relationSuggestions[segment.id] || [];
    suggestions.slice(0, rows.length).forEach((suggestion, index) => {
      if (!rows[index].done && !rows[index].manual && suggestion.name) {
        rows[index].name = suggestion.name;
        rows[index].source = suggestion.source || "";
        rows[index].reason = suggestion.reason || "";
        changed = true;
      }
    });
  });
  if (changed) saveState();
}

function scheduleStatePush() {
  window.clearTimeout(statePushTimer);
  statePushTimer = window.setTimeout(pushStateToServer, 600);
}

function scheduleCloudPush() {
  window.DominiqueOSCloud?.schedulePush?.(state);
}

async function pushStateToServer() {
  if (!syncState.serverOnline && location.protocol === "file:") return;
  try {
    await apiPost("/api/os-state", { state, date: selectedDateKey, activeView });
  } catch {
    // Static file mode is supported; server persistence is best-effort.
  }
}

async function syncTodayToFeishu() {
  if (!window.confirm(`将 ${selectedDateKey} 的探索地图摘要写入飞书 \`个人数据库 / 时间\`？这不会删除任何飞书资料。`)) {
    return;
  }
  updateSyncIndicator("warning", "写入中");
  try {
    const result = await apiPost("/api/sync/today-to-feishu", {
      date: selectedDateKey,
      day: selectedDay(),
      state
    });
    updateSyncIndicator("online", result.mode === "update" ? "已更新飞书" : "已写入飞书");
    await loadRemoteData(true);
  } catch (error) {
    updateSyncIndicator("error", "写入失败");
    window.alert(`写入飞书失败：${error.message}`);
  }
}

function renderAll() {
  renderRoute();
  renderNodeEditor();
  renderCalendar();
  renderDomains();
  renderWorld();
  refreshIcons();
}

function renderRoute() {
  const day = selectedDay();
  const nodes = document.getElementById("routeNodes");
  const path = route.map((node, index) => `${index === 0 ? "M" : "L"} ${node.x * 10} ${node.y * 5.6}`).join(" ");
  document.getElementById("routePath").setAttribute("d", path);
  document.getElementById("routeShadow").setAttribute("d", path);

  nodes.innerHTML = route.map((node) => {
    const domain = domains[node.domain];
    const entry = day.route[node.id];
    return `
      <button
        class="route-node ${entry.done ? "done" : ""} ${selectedNodeId === node.id ? "active" : ""}"
        data-node-id="${node.id}"
        style="left: ${node.x}%; top: ${node.y}%; --node-color: ${domain.color};"
        type="button"
        aria-label="${node.step} ${node.label}"
      >
        <span>${node.label}</span>
        <small>${entry.done ? "Done" : node.step.replace("第 ", "").replace(" 站", "")}</small>
      </button>
    `;
  }).join("");

  nodes.querySelectorAll(".route-node").forEach((button) => {
    button.addEventListener("click", () => {
      selectedNodeId = button.dataset.nodeId;
      renderAll();
    });
  });

  const doneCount = route.filter((node) => day.route[node.id].done).length;
  document.getElementById("todayProgress").textContent = `${doneCount}/9`;
  document.getElementById("mapFeedback").textContent = createFeedbackSentence();
}

function renderQuote() {
  const numeric = Number(selectedDateKey.replaceAll("-", ""));
  const quote = quotes[numeric % quotes.length];
  document.getElementById("dailyQuote").textContent = quote.text;
  document.getElementById("dailyQuoteSource").textContent = quote.source;
}

function selectedNode() {
  return route.find((node) => node.id === selectedNodeId) || route[0];
}

function renderNodeEditor() {
  const day = selectedDay();
  const node = selectedNode();
  const domain = domains[node.domain];
  const entry = day.route[node.id];

  document.getElementById("selectedDot").style.background = domain.color;
  document.getElementById("selectedDot").style.boxShadow = `0 0 0 8px ${hexToRgba(domain.color, 0.13)}`;
  document.getElementById("selectedStep").textContent = node.step;
  document.getElementById("selectedTitle").textContent = node.label;
  document.getElementById("selectedDefinition").textContent = domain.definition;
  document.getElementById("selectedGoal").textContent = domain.goal;
  document.getElementById("nodeDone").checked = entry.done;
  document.getElementById("nodeStatus").value = entry.status;
}

function updateSelectedNode() {
  const day = selectedDay();
  const entry = day.route[selectedNodeId];
  entry.done = document.getElementById("nodeDone").checked;
  entry.status = document.getElementById("nodeStatus").value.trim();
  saveState();
  renderRoute();
  renderCalendar();
  renderDomains();
}

function clearSelectedNode() {
  const day = selectedDay();
  day.route[selectedNodeId] = { done: false, status: "" };
  saveState();
  renderAll();
}

function resetToday() {
  if (!window.confirm(`重置 ${selectedDateKey} 的探索地图、任务状态和项目输入？`)) {
    return;
  }
  delete state.days[selectedDateKey];
  ensureDay(selectedDateKey);
  saveState();
  renderAll();
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function renderCalendar() {
  renderWeekCalendar();
  renderMonthCalendar();
  bindCalendarDateSelection();
}

function renderWeekCalendar() {
  const week = document.getElementById("weekCalendar");
  const start = startOfWeek(dateFromKey(selectedDateKey));
  const names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const html = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = formatDate(date);
    const day = state.days[key];
    const entries = day ? route
      .map((node) => ({ node, entry: day.route[node.id] }))
      .filter(({ entry }) => entry?.done || entry?.status)
      .map(({ node, entry }) => {
        const domain = domains[node.domain];
        return `
          <div class="entry-chip" style="--node-color: ${domain.color};">
            <strong>${node.label}${entry.done ? " · 完成" : ""}</strong>
            <p>${escapeHtml(entry.status || domain.goal)}</p>
          </div>
        `;
      }).join("") : "";
    return `
      <div class="week-day ${key === selectedDateKey ? "selected" : ""}" data-calendar-date="${key}" tabindex="0">
        <div class="day-head">
          <strong>${names[index]}</strong>
          <span>${key.slice(5)}</span>
        </div>
        ${entries || `<div class="entry-chip"><strong>留白</strong><p>OS 里该日还没有记录。</p></div>`}
      </div>
    `;
  }).join("");
  week.innerHTML = html;
}

function renderMonthCalendar() {
  const calendar = document.getElementById("monthCalendar");
  const selectedDate = dateFromKey(selectedDateKey);
  const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const offset = (first.getDay() || 7) - 1;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const monthRecords = dedupeTimeRecords([
    ...(syncState.timeRecords || []),
    ...getCachedMonthRecords(selectedDateKey)
  ]);

  const html = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = formatDate(date);
    const muted = date.getMonth() !== selectedDate.getMonth();
    const day = state.days[key];
    const doneCount = day ? route.filter((node) => day.route[node.id]?.done).length : 0;
    const hasStatus = day ? route.some((node) => day.route[node.id]?.status) : false;
    const feishuItems = monthRecords.filter((item) => item.date === key);
    return `
      <div class="month-day ${muted ? "muted" : ""} ${key === selectedDateKey ? "selected" : ""}" data-calendar-date="${key}" tabindex="0">
        <strong>${date.getDate()}</strong>
        <div class="month-day-scroll">
          ${doneCount ? `<span class="month-marker">探索 ${doneCount}/9</span>` : ""}
          ${hasStatus ? `<span class="month-marker">状态记录</span>` : ""}
          ${feishuItems.map((item) => `<span class="month-marker feishu" title="${escapeAttr(item.title || item.eventType || "飞书")}">${escapeHtml(item.title || item.eventType || "飞书")}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");
  calendar.innerHTML = html;
}

function bindCalendarDateSelection() {
  document.querySelectorAll("[data-calendar-date]").forEach((element) => {
    const key = element.dataset.calendarDate;
    element.addEventListener("click", () => setSelectedDate(key));
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setSelectedDate(key);
    });
  });
}

function renderDomains() {
  const grid = document.getElementById("domainGrid");
  const day = selectedDay();
  const order = ["body", "sound", "world", "relation", "language", "rugoan", "meditation"];

  grid.innerHTML = order.map((id) => {
    const domain = domains[id];
    const nodes = route.filter((node) => node.domain === id);
    const total = nodes.length || 1;
    const done = nodes.filter((node) => day.route[node.id]?.done).length;
    const percent = Math.round((done / total) * 100);
    return `
      <article class="domain-card" style="--domain-color: ${domain.color};">
        <h3>${domain.name}</h3>
        <div class="domain-meta">${domain.tone} · ${done}/${total}</div>
        <p>${domain.definition}</p>
        <p>${domain.goal}</p>
        <div class="progress-bar"><span style="width: ${percent}%"></span></div>
        <div class="domain-score">当日完成 ${percent}%</div>
      </article>
    `;
  }).join("");

  document.getElementById("humanFeedback").textContent = createFeedbackSentence();
}

function createFeedbackSentence() {
  const day = selectedDay();
  const completed = route.filter((node) => day.route[node.id].done);
  const written = route.filter((node) => day.route[node.id].status);
  const last = written.at(-1);

  if (completed.length === route.length) {
    return "这一天这条线走完整了，可以轻轻收束，不用再向自己追加任务。";
  }

  if (completed.length >= 6) {
    return "这一天已经很饱满了，剩下的部分适合用温柔的方式补齐，而不是靠用力。";
  }

  if (completed.length >= 3) {
    return `这一天的节奏已经起来了，${last ? last.label : completed.at(-1).label} 这里留下的状态值得再看一眼。`;
  }

  if (written.length > 0) {
    return `你已经把 ${last.label} 的真实状态写下来了，这比完成一个漂亮清单更重要。`;
  }

  return "这一天可以先从一个最小动作开始，让系统服务你，而不是让你服务系统。";
}

function renderWorld() {
  renderRoutines();
  renderProjects();
  renderRelations();
  document.getElementById("weeklyReport").value = selectedDay().weeklyReport || "";
  document.getElementById("weeklyReport").oninput = (event) => {
    selectedDay().weeklyReport = event.target.value;
    saveState();
  };
}

function renderRoutines() {
  const grid = document.getElementById("routineGrid");
  const day = selectedDay();
  grid.innerHTML = routines.map((routine) => {
    const entry = day.routines[routine.id];
    const auto = syncState.automation[routine.id] || {};
    const done = entry.done || auto.done;
    const link = entry.link || auto.link || auto.path || "";
    const note = entry.note || auto.note || "";
    const openHref = hrefForLink(link);
    const evidenceLabel = auto.path ? shortPath(auto.path) : (openHref ? "当日证据" : "等待证据");
    return `
      <article class="routine-card" style="--routine-color: ${routine.color};">
        <div class="routine-top">
          <div>
            <h3>${routine.title}</h3>
            <p>${routine.subtitle}</p>
          </div>
          <label>
            <input type="checkbox" data-routine-done="${routine.id}" ${done ? "checked" : ""} />
            完成
          </label>
        </div>
        <input type="text" data-routine-link="${routine.id}" value="${escapeAttr(link)}" placeholder="链接或本地路径" />
        <div class="routine-link-row">
          ${openHref ? `
            <a class="routine-open" href="${escapeAttr(openHref)}" target="_blank" rel="noreferrer">
              <i data-lucide="external-link"></i>
              <span>打开</span>
            </a>
          ` : `<span class="routine-open disabled">未找到链接</span>`}
          <span>${escapeHtml(evidenceLabel)}</span>
        </div>
        <input type="text" data-routine-note="${routine.id}" value="${escapeAttr(note)}" placeholder="当日一句话" />
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-routine-done]").forEach((input) => {
    input.addEventListener("change", () => {
      day.routines[input.dataset.routineDone].done = input.checked;
      saveState();
    });
  });

  grid.querySelectorAll("[data-routine-link]").forEach((input) => {
    input.addEventListener("input", () => {
      day.routines[input.dataset.routineLink].link = input.value.trim();
      saveState();
    });
  });

  grid.querySelectorAll("[data-routine-note]").forEach((input) => {
    input.addEventListener("input", () => {
      day.routines[input.dataset.routineNote].note = input.value.trim();
      saveState();
    });
  });
}

function hrefForLink(value) {
  const link = String(value || "").trim();
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  if (link.startsWith("/api/")) return `${API_BASE}${link}`;
  if (link.startsWith("/Users/") || link.startsWith("~/")) {
    return `${API_BASE}/api/local-file?path=${encodeURIComponent(link)}`;
  }
  return "";
}

function shortPath(value) {
  const text = String(value || "");
  if (!text) return "";
  const parts = text.split("/");
  return parts.slice(-2).join("/");
}

function addProjectEntry() {
  const input = document.getElementById("projectInput");
  const value = input.value.trim();
  if (!value) return;
  selectedDay().projects.unshift({
    id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
    text: value,
    createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  });
  input.value = "";
  saveState();
  renderProjects();
}

function renderProjects() {
  const list = document.getElementById("projectList");
  const projects = selectedDay().projects;
  list.innerHTML = projects.length ? projects.map((item) => `
    <article class="project-item">
      <strong>${item.createdAt}</strong>
      <p>${escapeHtml(item.text)}</p>
    </article>
  `).join("") : `
    <article class="project-item">
      <strong>待输入</strong>
      <p>该日项目推进会沉淀到这里。</p>
    </article>
  `;
}

function renderRelations() {
  const root = document.getElementById("relationColumns");
  root.innerHTML = relationSegments.map((segment) => {
    const rows = state.relationPlan[segment.id] || [];
    const suggestions = syncState.relationSuggestions?.[segment.id] || [];
    return `
      <section class="relation-column">
        <h3>${segment.title}</h3>
        ${rows.map((row, index) => {
          const suggestion = suggestions[index] || {};
          const displayName = row.done || row.manual ? row.name : (suggestion.name || row.name || "");
          const reason = suggestion.reason || row.reason || "";
          return `
            <label class="relation-row">
              <input type="checkbox" data-relation-done="${segment.id}:${index}" ${row.done ? "checked" : ""} />
              <input type="text" data-relation-name="${segment.id}:${index}" value="${escapeAttr(displayName)}" placeholder="待同步" />
            </label>
            ${reason ? `<p class="relation-hint">${escapeHtml(reason)}</p>` : ""}
          `;
        }).join("")}
      </section>
    `;
  }).join("");

  root.querySelectorAll("[data-relation-done]").forEach((input) => {
    input.addEventListener("change", () => {
      const [segment, index] = input.dataset.relationDone.split(":");
      const rowIndex = Number(index);
      const textInput = root.querySelector(`[data-relation-name="${segment}:${index}"]`);
      state.relationPlan[segment][rowIndex].done = input.checked;
      state.relationPlan[segment][rowIndex].name = textInput?.value.trim() || state.relationPlan[segment][rowIndex].name;
      state.relationPlan[segment][rowIndex].manual = state.relationPlan[segment][rowIndex].manual || input.checked;
      saveState();
    });
  });

  root.querySelectorAll("[data-relation-name]").forEach((input) => {
    input.addEventListener("input", () => {
      const [segment, index] = input.dataset.relationName.split(":");
      state.relationPlan[segment][Number(index)].name = input.value.trim();
      state.relationPlan[segment][Number(index)].manual = true;
      saveState();
    });
  });
}

function generateWeeklyReport() {
  const day = selectedDay();
  const completedRoutines = routines
    .filter((routine) => day.routines[routine.id].done)
    .map((routine) => `- ${routine.title}：${day.routines[routine.id].note || "已完成"}`)
    .join("\n") || "- 本周新闻、预测市场、选股、一级市场待补充";

  const projects = day.projects
    .map((item) => `- ${item.text}`)
    .join("\n") || "- 项目推进待补充";

  const relations = relationSegments.map((segment) => {
    const done = state.relationPlan[segment.id]
      .filter((row) => row.done && row.name)
      .map((row) => row.name);
    return `- ${segment.title}：${done.length ? done.join("、") : "待维护"}`;
  }).join("\n");

  const report = `【${selectedDateKey} 周报草稿】

一、新闻和下周值得追踪的大事
${completedRoutines}

二、项目进展和下周 TODO
${projects}

三、IR 和 BD 进展
${relations}
`;

  day.weeklyReport = report;
  saveState();
  document.getElementById("weeklyReport").value = report;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const int = Number.parseInt(clean, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

init();
