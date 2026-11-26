/**
 * GREEN HOUSE — SPORTS & CULTURAL PARTICIPATION PORTAL
 * Rev. William Ward Senior Secondary School
 * Complete Application Controller
 */
(function () {
  "use strict";

  const CFG = window.GREEN_HOUSE_CONFIG || {};
  const SUPABASE_URL = (CFG.SUPABASE_URL || "").trim();
  const SUPABASE_KEY = (CFG.SUPABASE_PUBLISHABLE_KEY || "").trim();

  const isPlaceholderKey =
    !SUPABASE_KEY ||
    SUPABASE_KEY === "REPLACE_WITH_YOUR_SUPABASE_PUBLISHABLE_KEY" ||
    SUPABASE_KEY.length < 20;

  let supabaseClient = null;
  let isCloudVerified = false;
  let registrationOpen = true;
  let activeEvents = [];
  let allEvents = [];
  let allRegistrations = [];
  let currentManager = null;
  let deferredInstallPrompt = null;

  // DOM References
  const dom = {
    connectionPill: document.getElementById("connectionPill"),
    connectionText: document.getElementById("connectionText"),
    offlineNotice: document.getElementById("offlineNotice"),
    setupNotice: document.getElementById("setupNotice"),
    heroRegBadge: document.getElementById("heroRegBadge"),
    heroSportsCount: document.getElementById("heroSportsCount"),
    heroCulturalCount: document.getElementById("heroCulturalCount"),

    navStudentBtn: document.getElementById("navStudentBtn"),
    navManagerBtn: document.getElementById("navManagerBtn"),
    installAppBtn: document.getElementById("installAppBtn"),
    footerStudentLink: document.getElementById("footerStudentLink"),
    footerManagerLink: document.getElementById("footerManagerLink"),

    studentView: document.getElementById("studentView"),
    managerView: document.getElementById("managerView"),

    regClosedAlert: document.getElementById("regClosedAlert"),
    studentFeedback: document.getElementById("studentFeedback"),
    studentRegForm: document.getElementById("studentRegForm"),
    studentFullName: document.getElementById("studentFullName"),
    studentRollNumber: document.getElementById("studentRollNumber"),
    sportsEventsContainer: document.getElementById("sportsEventsContainer"),
    culturalEventsContainer: document.getElementById("culturalEventsContainer"),
    selectedSportsCount: document.getElementById("selectedSportsCount"),
    selectedCulturalCount: document.getElementById("selectedCulturalCount"),
    submitRegBtn: document.getElementById("submitRegBtn"),
    resetRegFormBtn: document.getElementById("resetRegFormBtn"),
    registrationReceipt: document.getElementById("registrationReceipt"),
    receiptDetails: document.getElementById("receiptDetails"),

    managerLoginBox: document.getElementById("managerLoginBox"),
    managerLoginFeedback: document.getElementById("managerLoginFeedback"),
    managerLoginForm: document.getElementById("managerLoginForm"),
    managerEmail: document.getElementById("managerEmail"),
    managerPassword: document.getElementById("managerPassword"),
    managerLoginBtn: document.getElementById("managerLoginBtn"),

    managerDashboardBox: document.getElementById("managerDashboardBox"),
    managerIdentityLabel: document.getElementById("managerIdentityLabel"),
    refreshDashboardBtn: document.getElementById("refreshDashboardBtn"),
    managerLogoutBtn: document.getElementById("managerLogoutBtn"),
    dashboardFeedback: document.getElementById("dashboardFeedback"),

    statTotalStudents: document.getElementById("statTotalStudents"),
    statTotalSportsEntries: document.getElementById("statTotalSportsEntries"),
    statTotalCulturalEntries: document.getElementById("statTotalCulturalEntries"),
    statActiveEvents: document.getElementById("statActiveEvents"),
    statActiveEventsDetail: document.getElementById("statActiveEventsDetail"),
    sportsBreakdownList: document.getElementById("sportsBreakdownList"),
    culturalBreakdownList: document.getElementById("culturalBreakdownList"),
    recentRegistrationsBody: document.getElementById("recentRegistrationsBody"),

    participantSearchInput: document.getElementById("participantSearchInput"),
    participantFilterSelect: document.getElementById("participantFilterSelect"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    participantsTableBody: document.getElementById("participantsTableBody"),

    addEventForm: document.getElementById("addEventForm"),
    newEventName: document.getElementById("newEventName"),
    newEventCategory: document.getElementById("newEventCategory"),
    manageSportsEventsBody: document.getElementById("manageSportsEventsBody"),
    manageCulturalEventsBody: document.getElementById("manageCulturalEventsBody"),

    settingsRegStatusText: document.getElementById("settingsRegStatusText"),
    openRegBtn: document.getElementById("openRegBtn"),
    closeRegBtn: document.getElementById("closeRegBtn"),
    backupDataBtn: document.getElementById("backupDataBtn"),
    restoreFileInput: document.getElementById("restoreFileInput")
  };

  // Utility: Escape HTML safely to prevent XSS
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(isoString) {
    if (!isoString) return "—";
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return String(isoString);
    }
  }

  function showAlert(el, type, message) {
    if (!el) return;
    el.className = "alert alert-" + type;
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function hideAlert(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.textContent = "";
  }

  function setConnectionState(state, text) {
    dom.connectionPill.classList.remove("is-connected", "is-error");
    if (state === "connected") {
      dom.connectionPill.classList.add("is-connected");
    } else if (state === "error") {
      dom.connectionPill.classList.add("is-error");
    }
    dom.connectionText.textContent = text;
  }

  // Network Online / Offline Listener
  function updateNetworkStatus() {
    if (navigator.onLine) {
      dom.offlineNotice.classList.add("hidden");
    } else {
      dom.offlineNotice.classList.remove("hidden");
      setConnectionState("error", "Offline Mode");
    }
  }

  window.addEventListener("online", () => {
    updateNetworkStatus();
    if (supabaseClient) {
      loadPublicPortalState();
    }
  });
  window.addEventListener("offline", updateNetworkStatus);

  // PWA Service Worker & Android Install Prompt
  function initPwaSupport() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("Service worker registration skipped:", err);
      });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      dom.installAppBtn.classList.remove("hidden");
    });

    dom.installAppBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      dom.installAppBtn.classList.add("hidden");
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      dom.installAppBtn.classList.add("hidden");
    });
  }

  // View Switching (Student Portal vs Management Portal)
  function switchView(targetId) {
    dom.studentView.classList.toggle("active", targetId === "studentView");
    dom.managerView.classList.toggle("active", targetId === "managerView");
    dom.navStudentBtn.classList.toggle("active", targetId === "studentView");
    dom.navManagerBtn.classList.toggle("active", targetId === "managerView");
  }

  dom.navStudentBtn.addEventListener("click", () => switchView("studentView"));
  dom.navManagerBtn.addEventListener("click", () => switchView("managerView"));
  dom.footerStudentLink.addEventListener("click", (e) => {
    e.preventDefault();
    switchView("studentView");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  dom.footerManagerLink.addEventListener("click", (e) => {
    e.preventDefault();
    switchView("managerView");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Dashboard Sub-tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-btn").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === targetTab);
      });
    });
  });

  // Initialize Supabase Client Safely
  function initSupabaseClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      setConnectionState("error", "Supabase SDK Unavailable");
      showAlert(
        dom.setupNotice,
        "warning",
        "Supabase client library could not load. Please check your internet connection."
      );
      return false;
    }

    if (!SUPABASE_URL || isPlaceholderKey) {
      setConnectionState("error", "Configuration Required");
      dom.setupNotice.classList.remove("hidden");
      dom.heroRegBadge.className = "reg-badge pending";
      dom.heroRegBadge.textContent = "Awaiting Supabase Key";
      renderStudentEventChoices([]);
      return false;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    return true;
  }

  // Load Public Portal Settings & Active Events
  async function loadPublicPortalState() {
    if (!supabaseClient) return;

    try {
      const [settingsRes, eventsRes] = await Promise.all([
        supabaseClient
          .from("settings")
          .select("registration_open")
          .eq("id", 1)
          .maybeSingle(),
        supabaseClient
          .from("events")
          .select("id, name, category, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      isCloudVerified = true;
      dom.setupNotice.classList.add("hidden");
      setConnectionState("connected", "Cloud Connected • Verified");

      registrationOpen = settingsRes.data ? Boolean(settingsRes.data.registration_open) : true;
      activeEvents = Array.isArray(eventsRes.data) ? eventsRes.data : [];

      updateRegistrationAvailabilityUi();
      renderStudentEventChoices(activeEvents);
    } catch (err) {
      isCloudVerified = false;
      setConnectionState("error", "Database Setup Incomplete");
      dom.setupNotice.classList.remove("hidden");
      dom.heroRegBadge.className = "reg-badge pending";
      dom.heroRegBadge.textContent = "Database Not Ready";
      console.error("Supabase public load error:", err);
      renderStudentEventChoices([]);
    }
  }

  function updateRegistrationAvailabilityUi() {
    const sportsActive = activeEvents.filter((e) => e.category === "sports").length;
    const culturalActive = activeEvents.filter((e) => e.category === "cultural").length;

    dom.heroSportsCount.textContent = String(sportsActive);
    dom.heroCulturalCount.textContent = String(culturalActive);

    if (registrationOpen) {
      dom.heroRegBadge.className = "reg-badge open";
      dom.heroRegBadge.textContent = "Registrations Open";
      dom.regClosedAlert.classList.add("hidden");
      dom.submitRegBtn.disabled = false;
      dom.settingsRegStatusText.textContent = "OPEN (Accepting Student Entries)";
    } else {
      dom.heroRegBadge.className = "reg-badge closed";
      dom.heroRegBadge.textContent = "Registrations Closed";
      dom.regClosedAlert.classList.remove("hidden");
      dom.submitRegBtn.disabled = true;
      dom.settingsRegStatusText.textContent = "CLOSED (Student Form Paused)";
    }
  }

  function renderStudentEventChoices(eventsList) {
    const sports = eventsList.filter((e) => e.category === "sports");
    const cultural = eventsList.filter((e) => e.category === "cultural");

    renderCategoryCheckboxes(dom.sportsEventsContainer, sports, "sports");
    renderCategoryCheckboxes(dom.culturalEventsContainer, cultural, "cultural");
    updateSelectedCounters();
  }

  function renderCategoryCheckboxes(container, items, category) {
    if (!items.length) {
      container.innerHTML =
        '<p class="form-hint">No active ' +
        escapeHtml(category) +
        " events are currently available.</p>";
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const safeName = escapeHtml(item.name);
        return (
          '<label class="event-option">' +
          '<input type="checkbox" name="' +
          escapeHtml(category) +
          '_event" value="' +
          safeName +
          '" />' +
          "<span>" +
          safeName +
          "</span>" +
          "</label>"
        );
      })
      .join("");

    container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        checkbox.closest(".event-option").classList.toggle("selected", checkbox.checked);
        updateSelectedCounters();
      });
    });
  }

  function getSelectedEvents(category) {
    return Array.from(
      document.querySelectorAll('input[name="' + category + '_event"]:checked')
    ).map((cb) => cb.value);
  }

  function updateSelectedCounters() {
    const sportsCount = getSelectedEvents("sports").length;
    const culturalCount = getSelectedEvents("cultural").length;
    dom.selectedSportsCount.textContent = sportsCount + " selected";
    dom.selectedCulturalCount.textContent = culturalCount + " selected";
  }

  function resetStudentForm() {
    dom.studentRegForm.reset();
    document.querySelectorAll(".event-option").forEach((el) => el.classList.remove("selected"));
    updateSelectedCounters();
  }

  dom.resetRegFormBtn.addEventListener("click", () => {
    resetStudentForm();
    hideAlert(dom.studentFeedback);
  });

  // Student Registration Submission via Secured Supabase RPC
  dom.studentRegForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(dom.studentFeedback);
    dom.registrationReceipt.classList.add("hidden");

    if (!navigator.onLine) {
      showAlert(
        dom.studentFeedback,
        "danger",
        "You are offline. Please connect to the internet to submit your registration."
      );
      return;
    }

    if (!supabaseClient || !isCloudVerified) {
      showAlert(
        dom.studentFeedback,
        "danger",
        "Portal database is not yet connected. Please complete Supabase setup in config.js and supabase_setup.sql."
      );
      return;
    }

    if (!registrationOpen) {
      showAlert(
        dom.studentFeedback,
        "danger",
        "Registrations are currently closed by Green House management."
      );
      return;
    }

    const fullName = dom.studentFullName.value.trim().replace(/\s+/g, " ");
    const rollNumber = dom.studentRollNumber.value.trim().toUpperCase();
    const sportsSelected = getSelectedEvents("sports");
    const culturalSelected = getSelectedEvents("cultural");

    if (fullName.length < 2) {
      showAlert(dom.studentFeedback, "danger", "Please enter your full name (at least 2 characters).");
      dom.studentFullName.focus();
      return;
    }

    if (!/^[A-Z0-9][A-Z0-9\-\/]{0,29}$/.test(rollNumber)) {
      showAlert(
        dom.studentFeedback,
        "danger",
        "Please enter a valid school roll number (letters, numbers, hyphens, or slashes only)."
      );
      dom.studentRollNumber.focus();
      return;
    }

    if (sportsSelected.length === 0 && culturalSelected.length === 0) {
      showAlert(
        dom.studentFeedback,
        "danger",
        "Please select at least one Sports event or Cultural event before submitting."
      );
      return;
    }

    dom.submitRegBtn.disabled = true;
    dom.submitRegBtn.textContent = "Submitting Registration...";

    try {
      const { data, error } = await supabaseClient.rpc("submit_student_registration", {
        p_full_name: fullName,
        p_roll_number: rollNumber,
        p_sports_events: sportsSelected,
        p_cultural_events: culturalSelected
      });

      if (error) {
        throw new Error(error.message || "Registration could not be completed.");
      }

      const receipt = data || {};
      showAlert(
        dom.studentFeedback,
        "success",
        "Registration confirmed! Thank you for representing Green House."
      );

      dom.receiptDetails.innerHTML =
        "<div><strong>Student Name:</strong><br/>" +
        escapeHtml(receipt.full_name || fullName) +
        "</div>" +
        "<div><strong>Roll Number:</strong><br/>" +
        escapeHtml(receipt.roll_number || rollNumber) +
        "</div>" +
        "<div><strong>Sports Events (" +
        sportsSelected.length +
        "):</strong><br/>" +
        escapeHtml(sportsSelected.length ? sportsSelected.join(", ") : "None") +
        "</div>" +
        "<div><strong>Cultural Events (" +
        culturalSelected.length +
        "):</strong><br/>" +
        escapeHtml(culturalSelected.length ? culturalSelected.join(", ") : "None") +
        "</div>";

      dom.registrationReceipt.classList.remove("hidden");
      resetStudentForm();
    } catch (err) {
      showAlert(
        dom.studentFeedback,
        "danger",
        err.message || "Unable to submit registration. Please try again."
      );
    } finally {
      dom.submitRegBtn.disabled = !registrationOpen;
      dom.submitRegBtn.textContent = "Submit Registration";
    }
  });

  // =========================================================
  // MANAGEMENT AUTHENTICATION & AUTHORIZATION
  // =========================================================
  async function verifyAuthorizedManager() {
    if (!supabaseClient) return null;

    const { data: sessionData } = await supabaseClient.auth.getSession();
    const session = sessionData && sessionData.session;
    if (!session || !session.user) {
      currentManager = null;
      showManagerLoginUi();
      return null;
    }

    const { data: verifyData, error: verifyError } = await supabaseClient.rpc(
      "verify_manager_access"
    );

    if (verifyError || !verifyData || !verifyData.authorized) {
      await supabaseClient.auth.signOut();
      currentManager = null;
      showManagerLoginUi();
      showAlert(
        dom.managerLoginFeedback,
        "danger",
        "Access Denied: This account is not listed as an active authorized Green House manager."
      );
      return null;
    }

    currentManager = {
      userId: session.user.id,
      email: verifyData.email || session.user.email,
      fullName: verifyData.full_name || "Green House Manager",
      role: verifyData.role || "manager"
    };

    dom.managerIdentityLabel.textContent =
      currentManager.fullName + " (" + currentManager.email + ")";
    dom.managerLoginBox.classList.add("hidden");
    dom.managerDashboardBox.classList.remove("hidden");
    hideAlert(dom.managerLoginFeedback);

    await loadManagerDashboardData();
    return currentManager;
  }

  function showManagerLoginUi() {
    dom.managerDashboardBox.classList.add("hidden");
    dom.managerLoginBox.classList.remove("hidden");
  }

  dom.managerLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(dom.managerLoginFeedback);

    if (!supabaseClient) {
      showAlert(
        dom.managerLoginFeedback,
        "danger",
        "Supabase configuration is incomplete. Please update config.js first."
      );
      return;
    }

    const email = dom.managerEmail.value.trim();
    const password = dom.managerPassword.value;

    if (!email || !password) {
      showAlert(dom.managerLoginFeedback, "danger", "Please enter both email and password.");
      return;
    }

    dom.managerLoginBtn.disabled = true;
    dom.managerLoginBtn.textContent = "Verifying Credentials...";

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw new Error(error.message || "Invalid management login credentials.");
      }

      dom.managerPassword.value = "";
      await verifyAuthorizedManager();
    } catch (err) {
      showAlert(
        dom.managerLoginFeedback,
        "danger",
        err.message || "Sign-in failed. Please verify your credentials."
      );
    } finally {
      dom.managerLoginBtn.disabled = false;
      dom.managerLoginBtn.textContent = "Sign In to Management Portal";
    }
  });

  dom.managerLogoutBtn.addEventListener("click", async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    currentManager = null;
    allRegistrations = [];
    showManagerLoginUi();
    showAlert(dom.managerLoginFeedback, "info", "You have signed out securely.");
  });

  dom.refreshDashboardBtn.addEventListener("click", async () => {
    hideAlert(dom.dashboardFeedback);
    await loadPublicPortalState();
    await loadManagerDashboardData();
    showAlert(dom.dashboardFeedback, "success", "Dashboard data refreshed.");
  });

  // =========================================================
  // MANAGEMENT DATA LOADING & RENDERING
  // =========================================================
  async function loadManagerDashboardData() {
    if (!supabaseClient || !currentManager) return;

    try {
      const [eventsRes, regsRes, settingsRes] = await Promise.all([
        supabaseClient
          .from("events")
          .select("id, name, category, is_active, sort_order, created_at")
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabaseClient
          .from("registrations")
          .select("id, full_name, roll_number, sports_events, cultural_events, created_at")
          .order("created_at", { ascending: false }),
        supabaseClient
          .from("settings")
          .select("registration_open")
          .eq("id", 1)
          .maybeSingle()
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (regsRes.error) throw regsRes.error;
      if (settingsRes.error) throw settingsRes.error;

      allEvents = eventsRes.data || [];
      allRegistrations = regsRes.data || [];
      registrationOpen = settingsRes.data ? Boolean(settingsRes.data.registration_open) : true;

      updateRegistrationAvailabilityUi();
      renderOverviewStats();
      renderParticipantsTable();
      renderManageEventsTables();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Failed to load management records: " + (err.message || "Unknown error")
      );
    }
  }

  function renderOverviewStats() {
    const totalStudents = allRegistrations.length;
    let totalSportsEntries = 0;
    let totalCulturalEntries = 0;
    const sportsCounts = {};
    const culturalCounts = {};

    allEvents.forEach((ev) => {
      if (ev.category === "sports") sportsCounts[ev.name] = 0;
      if (ev.category === "cultural") culturalCounts[ev.name] = 0;
    });

    allRegistrations.forEach((reg) => {
      const sList = Array.isArray(reg.sports_events) ? reg.sports_events : [];
      const cList = Array.isArray(reg.cultural_events) ? reg.cultural_events : [];
      totalSportsEntries += sList.length;
      totalCulturalEntries += cList.length;

      sList.forEach((name) => {
        sportsCounts[name] = (sportsCounts[name] || 0) + 1;
      });
      cList.forEach((name) => {
        culturalCounts[name] = (culturalCounts[name] || 0) + 1;
      });
    });

    const activeSports = allEvents.filter((e) => e.category === "sports" && e.is_active).length;
    const activeCultural = allEvents.filter((e) => e.category === "cultural" && e.is_active).length;

    dom.statTotalStudents.textContent = String(totalStudents);
    dom.statTotalSportsEntries.textContent = String(totalSportsEntries);
    dom.statTotalCulturalEntries.textContent = String(totalCulturalEntries);
    dom.statActiveEvents.textContent = String(activeSports + activeCultural);
    dom.statActiveEventsDetail.textContent =
      activeSports + " Sports • " + activeCultural + " Cultural";

    renderBreakdownBars(dom.sportsBreakdownList, sportsCounts, false);
    renderBreakdownBars(dom.culturalBreakdownList, culturalCounts, true);

    const recent = allRegistrations.slice(0, 5);
    if (!recent.length) {
      dom.recentRegistrationsBody.innerHTML =
        '<tr><td colspan="5">No registrations recorded yet.</td></tr>';
    } else {
      dom.recentRegistrationsBody.innerHTML = recent
        .map((r) => {
          const sCount = Array.isArray(r.sports_events) ? r.sports_events.length : 0;
          const cCount = Array.isArray(r.cultural_events) ? r.cultural_events.length : 0;
          return (
            "<tr>" +
            "<td><strong>" +
            escapeHtml(r.roll_number) +
            "</strong></td>" +
            "<td>" +
            escapeHtml(r.full_name) +
            "</td>" +
            "<td>" +
            sCount +
            " event(s)</td>" +
            "<td>" +
            cCount +
            " event(s)</td>" +
            "<td>" +
            escapeHtml(formatDateTime(r.created_at)) +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    }
  }

  function renderBreakdownBars(container, countsMap, isCultural) {
    const entries = Object.entries(countsMap).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      container.innerHTML = '<p class="form-hint">No events configured.</p>';
      return;
    }

    const maxVal = Math.max(1, ...entries.map((e) => e[1]));
    container.innerHTML = entries
      .map(([name, count]) => {
        const pct = Math.round((count / maxVal) * 100);
        return (
          '<div class="bar-row">' +
          '<div class="bar-label-row">' +
          "<span>" +
          escapeHtml(name) +
          "</span>" +
          "<span>" +
          count +
          "</span>" +
          "</div>" +
          '<div class="bar-track">' +
          '<div class="bar-fill' +
          (isCultural ? " cultural" : "") +
          '" style="width:' +
          pct +
          '%"></div>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  // Participants Table & Search/Filter
  function getFilteredRegistrations() {
    const query = (dom.participantSearchInput.value || "").trim().toLowerCase();
    const filter = dom.participantFilterSelect.value;

    return allRegistrations.filter((reg) => {
      const sList = Array.isArray(reg.sports_events) ? reg.sports_events : [];
      const cList = Array.isArray(reg.cultural_events) ? reg.cultural_events : [];

      if (filter === "sports" && sList.length === 0) return false;
      if (filter === "cultural" && cList.length === 0) return false;

      if (!query) return true;
      const nameMatch = (reg.full_name || "").toLowerCase().includes(query);
      const rollMatch = (reg.roll_number || "").toLowerCase().includes(query);
      return nameMatch || rollMatch;
    });
  }

  function renderParticipantsTable() {
    const filtered = getFilteredRegistrations();
    if (!filtered.length) {
      dom.participantsTableBody.innerHTML =
        '<tr><td colspan="6">No matching student records found.</td></tr>';
      return;
    }

    dom.participantsTableBody.innerHTML = filtered
      .map((reg) => {
        const sList = Array.isArray(reg.sports_events) ? reg.sports_events : [];
        const cList = Array.isArray(reg.cultural_events) ? reg.cultural_events : [];

        const sBadges = sList.length
          ? '<div class="badge-list">' +
            sList.map((e) => '<span class="mini-badge">' + escapeHtml(e) + "</span>").join("") +
            "</div>"
          : '<span class="form-hint">None</span>';

        const cBadges = cList.length
          ? '<div class="badge-list">' +
            cList
              .map((e) => '<span class="mini-badge cultural">' + escapeHtml(e) + "</span>")
              .join("") +
            "</div>"
          : '<span class="form-hint">None</span>';

        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(reg.roll_number) +
          "</strong></td>" +
          "<td>" +
          escapeHtml(reg.full_name) +
          "</td>" +
          "<td>" +
          sBadges +
          "</td>" +
          "<td>" +
          cBadges +
          "</td>" +
          "<td>" +
          escapeHtml(formatDateTime(reg.created_at)) +
          "</td>" +
          '<td><button type="button" class="btn btn-danger btn-sm" data-delete-reg="' +
          escapeHtml(reg.id) +
          '" data-student-name="' +
          escapeHtml(reg.full_name) +
          '">Delete</button></td>' +
          "</tr>"
        );
      })
      .join("");

    dom.participantsTableBody.querySelectorAll("[data-delete-reg]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const regId = btn.getAttribute("data-delete-reg");
        const sName = btn.getAttribute("data-student-name");
        if (!window.confirm("Delete registration record for " + sName + "?")) return;
        await deleteParticipantRecord(regId);
      });
    });
  }

  async function deleteParticipantRecord(regId) {
    if (!supabaseClient || !currentManager) return;
    try {
      const { error } = await supabaseClient.from("registrations").delete().eq("id", regId);
      if (error) throw error;
      showAlert(dom.dashboardFeedback, "success", "Participant record removed.");
      await loadManagerDashboardData();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Could not delete record: " + (err.message || "Error")
      );
    }
  }

  dom.participantSearchInput.addEventListener("input", renderParticipantsTable);
  dom.participantFilterSelect.addEventListener("change", renderParticipantsTable);

  // CSV Export
  dom.exportCsvBtn.addEventListener("click", () => {
    const rows = getFilteredRegistrations();
    if (!rows.length) {
      showAlert(dom.dashboardFeedback, "warning", "No participant records to export.");
      return;
    }

    const csvEscape = (val) => {
      const str = String(val == null ? "" : val);
      if (/[",
]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const header = [
      "Roll Number",
      "Full Name",
      "Sports Events",
      "Cultural Events",
      "Total Events",
      "Registered At"
    ];

    const lines = [header.map(csvEscape).join(",")];
    rows.forEach((r) => {
      const sList = Array.isArray(r.sports_events) ? r.sports_events : [];
      const cList = Array.isArray(r.cultural_events) ? r.cultural_events : [];
      lines.push(
        [
          r.roll_number,
          r.full_name,
          sList.join("; "),
          cList.join("; "),
          sList.length + cList.length,
          r.created_at
        ]
          .map(csvEscape)
          .join(",")
      );
    });

    const blob = new Blob([lines.join("
")], { type: "text/csv;charset=utf-8;" });
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, "green_house_participants_" + dateStamp + ".csv");
    showAlert(dom.dashboardFeedback, "success", "Exported " + rows.length + " participant record(s) to CSV.");
  });

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =========================================================
  // EVENTS MANAGEMENT (ADD, EDIT, ENABLE/DISABLE, DELETE)
  // =========================================================
  function renderManageEventsTables() {
    const sports = allEvents.filter((e) => e.category === "sports");
    const cultural = allEvents.filter((e) => e.category === "cultural");

    renderSingleEventTable(dom.manageSportsEventsBody, sports);
    renderSingleEventTable(dom.manageCulturalEventsBody, cultural);
  }

  function renderSingleEventTable(tbody, list) {
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="3">No events in this category yet.</td></tr>';
      return;
    }

    tbody.innerHTML = list
      .map((ev) => {
        const statusHtml = ev.is_active
          ? '<span class="status-pill active">Active</span>'
          : '<span class="status-pill inactive">Disabled</span>';
        const toggleLabel = ev.is_active ? "Disable" : "Enable";

        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(ev.name) +
          "</strong></td>" +
          "<td>" +
          statusHtml +
          "</td>" +
          '<td><div class="action-group">' +
          '<button type="button" class="btn btn-outline btn-sm" data-edit-event="' +
          escapeHtml(ev.id) +
          '">Edit</button>' +
          '<button type="button" class="btn btn-outline btn-sm" data-toggle-event="' +
          escapeHtml(ev.id) +
          '">' +
          toggleLabel +
          "</button>" +
          '<button type="button" class="btn btn-danger btn-sm" data-delete-event="' +
          escapeHtml(ev.id) +
          '">Delete</button>' +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-edit-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = allEvents.find((item) => item.id === btn.getAttribute("data-edit-event"));
        if (ev) handleEditEvent(ev);
      });
    });

    tbody.querySelectorAll("[data-toggle-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = allEvents.find((item) => item.id === btn.getAttribute("data-toggle-event"));
        if (ev) handleToggleEvent(ev);
      });
    });

    tbody.querySelectorAll("[data-delete-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = allEvents.find((item) => item.id === btn.getAttribute("data-delete-event"));
        if (ev) handleDeleteEvent(ev);
      });
    });
  }

  dom.addEventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient || !currentManager) return;

    const name = dom.newEventName.value.trim().replace(/\s+/g, " ");
    const category = dom.newEventCategory.value;

    if (name.length < 2) {
      showAlert(dom.dashboardFeedback, "danger", "Please enter a valid event name.");
      return;
    }

    try {
      const nextOrder =
        allEvents.filter((e) => e.category === category).length + 1;

      const { error } = await supabaseClient.from("events").insert({
        name,
        category,
        is_active: true,
        sort_order: nextOrder
      });

      if (error) throw error;

      dom.newEventName.value = "";
      showAlert(dom.dashboardFeedback, "success", 'Added event "' + name + '".');
      await loadPublicPortalState();
      await loadManagerDashboardData();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Could not add event: " + (err.message || "Duplicate or invalid event")
      );
    }
  });

  async function handleEditEvent(ev) {
    const updatedName = window.prompt("Enter updated event name:", ev.name);
    if (updatedName == null) return;
    const cleanName = updatedName.trim().replace(/\s+/g, " ");
    if (cleanName.length < 2 || cleanName === ev.name) return;

    try {
      const { error } = await supabaseClient
        .from("events")
        .update({ name: cleanName })
        .eq("id", ev.id);

      if (error) throw error;
      showAlert(dom.dashboardFeedback, "success", 'Event renamed to "' + cleanName + '".');
      await loadPublicPortalState();
      await loadManagerDashboardData();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Could not update event: " + (err.message || "Error")
      );
    }
  }

  async function handleToggleEvent(ev) {
    try {
      const { error } = await supabaseClient
        .from("events")
        .update({ is_active: !ev.is_active })
        .eq("id", ev.id);

      if (error) throw error;
      showAlert(
        dom.dashboardFeedback,
        "success",
        'Event "' + ev.name + '" is now ' + (!ev.is_active ? "enabled" : "disabled") + "."
      );
      await loadPublicPortalState();
      await loadManagerDashboardData();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Could not toggle event status: " + (err.message || "Error")
      );
    }
  }

  async function handleDeleteEvent(ev) {
    if (
      !window.confirm(
        'Permanently delete event "' +
          ev.name +
          '"? Tip: If students already registered for it, disabling is safer than deleting.'
      )
    ) {
      return;
    }

    try {
      const { error } = await supabaseClient.from("events").delete().eq("id", ev.id);
      if (error) throw error;
      showAlert(dom.dashboardFeedback, "success", 'Deleted event "' + ev.name + '".');
      await loadPublicPortalState();
      await loadManagerDashboardData();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Could not delete event: " + (err.message || "Error")
      );
    }
  }

  // =========================================================
  // SETTINGS, REGISTRATION TOGGLE, BACKUP & RESTORE
  // =========================================================
  async function setRegistrationStatus(openState) {
    if (!supabaseClient || !currentManager) return;

    try {
      const { error } = await supabaseClient
        .from("settings")
        .update({
          registration_open: openState,
          updated_at: new Date().toISOString(),
          updated_by: currentManager.userId
        })
        .eq("id", 1);

      if (error) throw error;

      registrationOpen = openState;
      updateRegistrationAvailabilityUi();
      showAlert(
        dom.dashboardFeedback,
        "success",
        openState
          ? "Student registration is now OPEN."
          : "Student registration is now CLOSED."
      );
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Failed to update registration status: " + (err.message || "Error")
      );
    }
  }

  dom.openRegBtn.addEventListener("click", () => setRegistrationStatus(true));
  dom.closeRegBtn.addEventListener("click", () => setRegistrationStatus(false));

  // JSON Backup
  dom.backupDataBtn.addEventListener("click", () => {
    if (!currentManager) return;

    const backupPayload = {
      portal: "GREEN HOUSE — SPORTS & CULTURAL PARTICIPATION PORTAL",
      school: CFG.SCHOOL_NAME || "REV. WILLIAM WARD SENIOR SECONDARY SCHOOL",
      exported_at: new Date().toISOString(),
      exported_by: currentManager.email,
      settings: {
        registration_open: registrationOpen
      },
      events: allEvents,
      registrations: allRegistrations
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: "application/json;charset=utf-8;"
    });
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, "green_house_backup_" + dateStamp + ".json");
    showAlert(
      dom.dashboardFeedback,
      "success",
      "Full JSON backup downloaded (" +
        allEvents.length +
        " events, " +
        allRegistrations.length +
        " registrations)."
    );
  });

  // JSON Restore
  dom.restoreFileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file || !supabaseClient || !currentManager) return;

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);

      if (!parsed || !Array.isArray(parsed.events) || !Array.isArray(parsed.registrations)) {
        throw new Error("Invalid backup file structure. Expected 'events' and 'registrations' arrays.");
      }

      if (
        !window.confirm(
          "Restore " +
            parsed.events.length +
            " event(s) and " +
            parsed.registrations.length +
            " registration(s) from this backup file?"
        )
      ) {
        dom.restoreFileInput.value = "";
        return;
      }

      // Restore events safely
      for (const ev of parsed.events) {
        if (!ev.name || !ev.category) continue;
        const exists = allEvents.some(
          (existing) =>
            existing.name.toLowerCase() === String(ev.name).trim().toLowerCase() &&
            existing.category === ev.category
        );
        if (!exists) {
          await supabaseClient.from("events").insert({
            name: String(ev.name).trim(),
            category: ev.category === "cultural" ? "cultural" : "sports",
            is_active: ev.is_active !== false,
            sort_order: Number(ev.sort_order) || 0
          });
        }
      }

      // Restore registrations safely (skip existing normalized roll numbers)
      let restoredRegs = 0;
      const existingRolls = new Set(
        allRegistrations.map((r) => String(r.roll_number || "").trim().toUpperCase())
      );

      for (const reg of parsed.registrations) {
        const cleanName = String(reg.full_name || "").trim();
        const cleanRoll = String(reg.roll_number || "").trim().toUpperCase();
        if (!cleanName || !cleanRoll || existingRolls.has(cleanRoll)) continue;

        const { error } = await supabaseClient.from("registrations").insert({
          full_name: cleanName,
          roll_number: cleanRoll,
          roll_number_normalized: cleanRoll,
          sports_events: Array.isArray(reg.sports_events) ? reg.sports_events : [],
          cultural_events: Array.isArray(reg.cultural_events) ? reg.cultural_events : []
        });

        if (!error) {
          existingRolls.add(cleanRoll);
          restoredRegs += 1;
        }
      }

      showAlert(
        dom.dashboardFeedback,
        "success",
        "Backup restore completed. Added " + restoredRegs + " new student registration(s)."
      );
      await loadPublicPortalState();
      await loadManagerDashboardData();
    } catch (err) {
      showAlert(
        dom.dashboardFeedback,
        "danger",
        "Restore failed: " + (err.message || "Invalid JSON file")
      );
    } finally {
      dom.restoreFileInput.value = "";
    }
  });

  // =========================================================
  // BOOTSTRAP APPLICATION
  // =========================================================
  async function init() {
    updateNetworkStatus();
    initPwaSupport();

    const ready = initSupabaseClient();
    if (!ready) return;

    await loadPublicPortalState();
    await verifyAuthorizedManager();
  }

  init();
})();
