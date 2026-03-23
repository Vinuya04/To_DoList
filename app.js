const STORAGE_KEY = "pulseplan.tasks";

const form = document.getElementById("taskForm");
const resetButton = document.getElementById("resetButton");
const taskList = document.getElementById("taskList");
const statsRow = document.getElementById("statsRow");
const taskTemplate = document.getElementById("taskCardTemplate");
const calendarGrid = document.getElementById("calendarGrid");
const calendarTitle = document.getElementById("calendarTitle");
const statusFilter = document.getElementById("statusFilter");
const notificationButton = document.getElementById("notificationButton");
const todayDate = document.getElementById("todayDate");
const todaySummary = document.getElementById("todaySummary");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");
const installButton = document.getElementById("installButton");
const exportButton = document.getElementById("exportButton");
const importButton = document.getElementById("importButton");
const importFileInput = document.getElementById("importFileInput");

let tasks = loadTasks();
let currentMonth = startOfMonth(new Date());
let reminderTimers = new Map();
let deferredInstallPrompt = null;

initialize();

function initialize() {
  todayDate.textContent = formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" });
  seedDueDate();
  bindEvents();
  registerServiceWorker();
  syncNotificationButton();
  scheduleReminders();
  window.setInterval(processDueReminders, 30000);
  render();
}

function bindEvents() {
  form.addEventListener("submit", handleAddTask);
  resetButton.addEventListener("click", () => {
    form.reset();
    seedDueDate();
  });
  statusFilter.addEventListener("change", renderTaskList);
  notificationButton.addEventListener("click", enableNotifications);
  prevMonth.addEventListener("click", () => changeMonth(-1));
  nextMonth.addEventListener("click", () => changeMonth(1));
  exportButton.addEventListener("click", exportTasks);
  importButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", importTasks);
  installButton.addEventListener("click", installApp);
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
}

function handleAddTask(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const title = formData.get("title").toString().trim();
  const notes = formData.get("notes").toString().trim();
  const date = formData.get("date").toString();
  const time = formData.get("time").toString();
  const priority = formData.get("priority").toString();
  const reminderMinutes = formData.get("reminder").toString();

  if (!title || !date) {
    return;
  }

  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    notes,
    date,
    time,
    priority,
    reminderMinutes,
    completed: false,
    reminderSent: false,
    createdAt: new Date().toISOString()
  });

  persistTasks();
  form.reset();
  seedDueDate();
  scheduleReminders();
  render();
}

function render() {
  renderStats();
  renderTaskList();
  renderCalendar();
  renderTodaySummary();
}

function renderStats() {
  const openTasks = tasks.filter((task) => !task.completed).length;
  const highPriority = tasks.filter((task) => !task.completed && task.priority === "high").length;
  const completed = tasks.filter((task) => task.completed).length;

  statsRow.innerHTML = `
    <div class="stat-card"><span>Open Tasks</span><strong>${openTasks}</strong></div>
    <div class="stat-card"><span>High Priority</span><strong>${highPriority}</strong></div>
    <div class="stat-card"><span>Completed</span><strong>${completed}</strong></div>
  `;
}

function renderTaskList() {
  const filteredTasks = getFilteredTasks(statusFilter.value);
  taskList.innerHTML = "";

  if (!filteredTasks.length) {
    taskList.innerHTML = `<div class="empty-state">No tasks in this view yet.</div>`;
    return;
  }

  filteredTasks
    .sort((left, right) => getTaskTimestamp(left) - getTaskTimestamp(right))
    .forEach((task) => {
      const fragment = taskTemplate.content.cloneNode(true);
      const card = fragment.querySelector(".task-card");
      const title = fragment.querySelector(".task-title");
      const notes = fragment.querySelector(".task-notes");
      const priority = fragment.querySelector(".priority-pill");
      const dateLine = fragment.querySelector(".task-date-line");
      const toggleButton = fragment.querySelector(".toggle-button");
      const deleteButton = fragment.querySelector(".delete-button");

      if (task.completed) {
        card.classList.add("completed");
      }

      title.textContent = task.title;
      notes.textContent = task.notes || "No notes added";
      priority.textContent = capitalize(task.priority);
      priority.classList.add(task.priority);
      dateLine.textContent = buildTaskScheduleLabel(task);
      toggleButton.textContent = task.completed ? "Mark open" : "Mark done";

      toggleButton.addEventListener("click", () => toggleTask(task.id));
      deleteButton.addEventListener("click", () => deleteTask(task.id));

      taskList.appendChild(fragment);
    });
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  calendarTitle.textContent = currentMonth.toLocaleDateString([], { month: "long", year: "numeric" });

  const monthStart = startOfMonth(currentMonth);
  const leadingDays = monthStart.getDay();
  const startDate = addDays(monthStart, -leadingDays);
  const totalCells = 42;

  for (let index = 0; index < totalCells; index += 1) {
    const cellDate = addDays(startDate, index);
    const dayTasks = tasks
      .filter((task) => task.date === toDateInputValue(cellDate))
      .sort((left, right) => getPriorityWeight(right.priority) - getPriorityWeight(left.priority));

    const cell = document.createElement("div");
    cell.className = "calendar-day";

    if (cellDate.getMonth() !== monthStart.getMonth()) {
      cell.classList.add("muted");
    }

    if (isSameDay(cellDate, new Date())) {
      cell.classList.add("today");
    }

    const number = document.createElement("div");
    number.className = "calendar-day-number";
    number.textContent = cellDate.getDate();
    cell.appendChild(number);

    dayTasks.slice(0, 3).forEach((task) => {
      const chip = document.createElement("div");
      chip.className = `calendar-task-chip ${task.priority}`;
      chip.textContent = task.title;
      cell.appendChild(chip);
    });

    if (dayTasks.length > 3) {
      const more = document.createElement("div");
      more.className = "calendar-task-chip low";
      more.textContent = `+${dayTasks.length - 3} more`;
      cell.appendChild(more);
    }

    calendarGrid.appendChild(cell);
  }
}

function renderTodaySummary() {
  const todayTasks = tasks.filter((task) => task.date === toDateInputValue(new Date()) && !task.completed);
  todaySummary.textContent = `${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"} scheduled`;
}

function toggleTask(taskId) {
  tasks = tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return { ...task, completed: !task.completed };
  });

  persistTasks();
  render();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  clearReminder(taskId);
  persistTasks();
  render();
}

function getFilteredTasks(filterValue) {
  const now = new Date();
  const todayValue = toDateInputValue(now);

  if (filterValue === "today") {
    return tasks.filter((task) => task.date === todayValue);
  }

  if (filterValue === "upcoming") {
    return tasks.filter((task) => !task.completed && getTaskTimestamp(task) >= startOfDay(now).getTime());
  }

  if (filterValue === "completed") {
    return tasks.filter((task) => task.completed);
  }

  if (filterValue === "open") {
    return tasks.filter((task) => !task.completed);
  }

  return tasks;
}

function enableNotifications() {
  if (!("Notification" in window)) {
    notificationButton.textContent = "Browser does not support reminders";
    notificationButton.disabled = true;
    return;
  }

  Notification.requestPermission().then(() => {
    syncNotificationButton();
    scheduleReminders();
  });
}

function syncNotificationButton() {
  if (!("Notification" in window)) {
    notificationButton.textContent = "Reminders unavailable";
    notificationButton.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    notificationButton.textContent = "Reminders enabled";
    notificationButton.disabled = true;
    return;
  }

  if (Notification.permission === "denied") {
    notificationButton.textContent = "Notifications blocked";
    notificationButton.disabled = true;
    return;
  }

  notificationButton.textContent = "Enable reminders";
}

function scheduleReminders() {
  reminderTimers.forEach((timerId) => window.clearTimeout(timerId));
  reminderTimers = new Map();

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  tasks.forEach((task) => {
    if (task.completed || task.reminderMinutes === "none" || task.reminderSent) {
      return;
    }

    const reminderAt = getReminderTime(task);
    if (!reminderAt) {
      return;
    }

    const delay = reminderAt.getTime() - Date.now();
    if (delay <= 0) {
      return;
    }

    const timerId = window.setTimeout(() => processDueReminders(), Math.min(delay, 2147483647));
    reminderTimers.set(task.id, timerId);
  });

  processDueReminders();
}

function processDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const now = Date.now();
  tasks.forEach((task) => {
    if (task.completed || task.reminderMinutes === "none" || task.reminderSent) {
      return;
    }

    const reminderAt = getReminderTime(task);
    if (reminderAt && reminderAt.getTime() <= now) {
      sendReminder(task.id);
    }
  });
}

function sendReminder(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task || task.completed || task.reminderSent) {
    return;
  }

  new Notification(`Reminder: ${task.title}`, {
    body: buildTaskScheduleLabel(task),
    silent: false
  });

  tasks = tasks.map((item) => item.id === taskId ? { ...item, reminderSent: true } : item);
  persistTasks();
  clearReminder(taskId);
  render();
}

function clearReminder(taskId) {
  const timerId = reminderTimers.get(taskId);
  if (timerId) {
    window.clearTimeout(timerId);
  }
  reminderTimers.delete(taskId);
}

function loadTasks() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    return rawValue ? JSON.parse(rawValue) : [];
  } catch {
    return [];
  }
}

function persistTasks() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function seedDueDate() {
  if (!document.getElementById("taskDate").value) {
    document.getElementById("taskDate").value = toDateInputValue(new Date());
  }
}

function changeMonth(offset) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  renderCalendar();
}

function buildTaskScheduleLabel(task) {
  const date = new Date(`${task.date}T${task.time || "09:00"}`);
  const timeLabel = task.time ? ` at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  const reminderLabel = task.reminderMinutes === "none" ? "No reminder" : `Reminder ${formatReminderText(task.reminderMinutes)}`;
  return `${formatDate(date, { month: "short", day: "numeric", year: "numeric" })}${timeLabel} | ${reminderLabel}`;
}

function formatReminderText(reminderMinutes) {
  const minutes = Number(reminderMinutes);

  if (minutes === 0) {
    return "at due time";
  }

  if (minutes < 60) {
    return `${minutes} min before`;
  }

  if (minutes === 1440) {
    return "1 day before";
  }

  return `${minutes / 60} hours before`;
}

function getReminderTime(task) {
  const dueAt = new Date(`${task.date}T${task.time || "09:00"}`);
  if (Number.isNaN(dueAt.getTime())) {
    return null;
  }

  return new Date(dueAt.getTime() - Number(task.reminderMinutes) * 60 * 1000);
}

function getTaskTimestamp(task) {
  const timestamp = new Date(`${task.date}T${task.time || "09:00"}`).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat([], options).format(date);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function getPriorityWeight(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 0;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
}

async function installApp() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
}

function handleAppInstalled() {
  deferredInstallPrompt = null;
  installButton.hidden = true;
}

function exportTasks() {
  const payload = {
    exportedAt: new Date().toISOString(),
    tasks
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pulseplan-backup-${toDateInputValue(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importTasks(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const importedTasks = Array.isArray(parsed) ? parsed : parsed.tasks;

      if (!Array.isArray(importedTasks)) {
        throw new Error("Invalid backup file.");
      }

      tasks = importedTasks
        .filter(isValidTask)
        .map((task) => ({
          ...task,
          id: task.id || crypto.randomUUID(),
          reminderSent: Boolean(task.reminderSent)
        }));

      persistTasks();
      scheduleReminders();
      render();
    } catch {
      window.alert("That file could not be imported.");
    } finally {
      importFileInput.value = "";
    }
  };

  reader.readAsText(file);
}

function isValidTask(task) {
  return task
    && typeof task.title === "string"
    && typeof task.date === "string"
    && typeof task.priority === "string";
}
