function getSessionId() {
  let id = sessionStorage.getItem("session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("session_id", id);
  }
  return id;
}

const API_HOST = "https://api.mtxvp.com";
 
const EVENT_ENDPOINT = API_HOST + "/bvsdt";
const queue = [];
let sending = false;
const MAX_BATCH = 10;


(function pageviewPixel() {
  const img = new Image();
  img.src = API_HOST +
    "/bvsarea.gif" +
    "?n=" + getSessionId() +
    "&p=" + encodeURIComponent(location.pathname) +
    "&s=" + encodeURIComponent(location.search) +
    "&r=" + encodeURIComponent(document.referrer || "") +
    "&_=" + Date.now();
})();

function track(eventType, data = null) {
  queue.push({
    timestamp: Date.now(),
    event_type: eventType,
    session_id: getSessionId(),
    page_path: location.pathname, 
    page_search: location.search,
    referrer: document.referrer || "",
    data: data
  });

  flushQueue();
}

function flushQueue(force = false) {
  if (sending || queue.length === 0) return;

  // Batch
  const batch = queue.splice(0, MAX_BATCH);
  const payload = JSON.stringify({
    t: Date.now(),
    events: batch
  });

  sending = true;

  fetch(EVENT_ENDPOINT, {
    method: "POST",
    body: payload,
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: force && payload.length < 60000, // unload-safe only
    credentials: "omit"
  })
  .catch(() => {
    // Optional fallback: fire-and-forget pixel
    fallbackPixel(payload);
  })
  .finally(() => {
    sending = false;

    // Continue flushing if more events exist
    if (queue.length > 0) {
      setTimeout(() => flushQueue(force), 0);
    }
  });
}

setInterval(() => flushQueue(false), 5000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushQueue(true);
  }
});

window.addEventListener("pagehide", () => {
  flushQueue(true);
});


document.addEventListener("DOMContentLoaded", () => {
  track("page_load", {
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight
  });
});

const scrollMarks = new Set();

window.addEventListener("scroll", () => {
  const scrolled =
    (window.scrollY + window.innerHeight) /
    document.documentElement.scrollHeight;

  [0.25, 0.5, 0.75].forEach(mark => {
    if (scrolled >= mark && !scrollMarks.has(mark)) {
      scrollMarks.add(mark);
      track(`scroll_${mark * 100}`);
    }
  });
}, { passive: true });


(function() {
  let sessionStart = Date.now();
  let tickCounter = 0;
  let tickInterval = null;
  const TICK_MINUTES = 30; 

  function startSession() {
    sessionStart = Date.now();
    track("session_start");
    startSparseTicks();
  }

  function endSession() {
    stopSparseTicks();
    const durationSec = Math.round((Date.now() - sessionStart) / 1000);
    track("session_end", { duration_sec: durationSec });
  }

  function startSparseTicks() {
    if (tickInterval) return;

    tickInterval = setInterval(() => {
      tickCounter++;
      if (tickCounter % 1 === 0) {
        track("active_time_tick");
      }
    }, TICK_MINUTES * 60 * 1000);
  }

  function stopSparseTicks() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  // Visibility change: pause/resume session
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      endSession();
    } else {
      startSession();
    }
  });

  // Page unload: ensure session_end fires
  window.addEventListener("pagehide", () => {
    endSession();
  });

  // Initialize
  startSession();
})();



// <a href="/areas/niagara"
//    data-click="click"
//    data-contentid="niagara">
//   Niagara Escarpment
// </a>

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-click]");
  if (!el) return;

  track('element_click', {
    content: el.dataset.contentid
  });
});

// Map nees special click capture 
(function trackFirstMapInteraction() {
  let fired = false;

  function handler(e) {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;
    if (!mapEl.contains(e.target)) return;

    fired = true;
    document.removeEventListener("pointerdown", handler, true);
    track('map_click', {
      content: e.target.dataset.contentid
    });
  }

  document.addEventListener("pointerdown", handler, true);
})();



// <section
//   id="map"
//   data-observe="observe"
//   data-content="map">
// </section>

// <form
//   id="subscribe"
//   data-observe="observe"
//   data-content="subscribe_form">
// </form>


(function semanticObservers() {
  if (!("IntersectionObserver" in window)) return;

  const fired = new Set();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const el = entry.target;
      const eventName = el.dataset.observe;
      const eventId = 'section_observe' + el.dataset.contentid
      if (!eventId || fired.has(eventId)) return;

      fired.add(eventId);

      track(eventName, {
        content: el.dataset.contentid
      });

      observer.unobserve(el);
    });
  }, {
    threshold: 0.5
  });

  document.querySelectorAll("[data-observe]").forEach(el => {
    observer.observe(el);
  });
})();


(function signupForm() {

  const form = document.getElementById("signup-form");
  if (!form) return; 

  const panel = document.getElementById("signup-panel");
  const errorPanel = document.getElementById("signup-error-panel");
  const button = form.querySelector("button");
  const label = button.querySelector(".btn-label");
  const spinner = button.querySelector(".btn-spinner");

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const email = form.querySelector("input").value.trim();
    if (!email) return;

    form.querySelectorAll("input, button").forEach(el => el.disabled = true);
    label.classList.add("d-none");
    spinner.classList.remove("d-none");
    errorPanel.classList.add("d-none");

    try {
      const res = await fetch(API_HOST + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw data;

      form.classList.add("d-none");
      panel.classList.remove("d-none");

    } catch (err) {
      form.classList.add("d-none");

      errorPanel.textContent =
        err?.message || "Something went wrong. Please try again.";

      errorPanel.classList.remove("d-none");
    }
  });

})();



document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("subscribe-confirm-panel");
  if (!panel) return; 

  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    panel.innerHTML = `
      <div class="card-body text-center">
        <h5 class="text-danger">Missing confirmation token</h5>
      </div>`;
    return;
  }

  fetch(API_HOST + "/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  })
  .then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw data;
    return data;
  })
  .then(() => {
    panel.innerHTML = `
      <div class="card-body text-center">
        <h5 class="text-success">Confirmed!</h5>
        <p>You’re now subscribed.</p>
      </div>`;
  })
  .catch(err => {
    const msg = err?.message || "Invalid or expired link";
    panel.innerHTML = `
      <div class="card-body text-center">
        <h5 class="text-danger">${msg}</h5>
      </div>`;
  });
});



document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("subscribe-remove-panel");
  if (!panel) return; 

  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    panel.innerHTML = `
      <div class="card-body text-center">
        <h5 class="text-danger">This unsubscribe token is invalid.</h5>
      </div>`;
    return;
  }

  fetch(API_HOST + "/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  })
  .then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw data;
    return data;
  })
  .then(() => {
    panel.innerHTML = `
      <div class="card-body text-center">
        <h1 class="h4">You're unsubscribed</h1>
        <p class="text-secondary">
          You will no longer receive emails from us.
        </p>
      </div>`;
  })
  .catch(err => {
    const msg = err?.message || "Invalid token";
    panel.innerHTML = `
      <div class="card-body text-center">
        <h5 class="text-danger">${msg}</h5>
      </div>`;
  });
});


