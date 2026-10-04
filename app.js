const db = window.supabase.createClient(
  window.DTS_SUPABASE_URL,
  window.DTS_SUPABASE_PUBLISHABLE_KEY
);


/* =====================================================
   GLOBAL
===================================================== */

let currentUser = null;
let staffProfile = null;
let staffUsers = [];
let bookings = [];

let calendarDate = new Date();

let selectedAvailabilityDate = null;

let selectedStartTime = null;
let selectedEndTime = null;


/* =====================================================
   HELPERS
===================================================== */

const $ = id =>
  document.getElementById(id);


function escapeHTML(value) {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =====================================================
   TIME HELPERS
===================================================== */

function timeToMinutes(time) {

  if (!time) {
    return 0;
  }

  const parts =
    time.split(":");

  return (
    Number(parts[0]) * 60 +
    Number(parts[1])
  );
}


function minutesToTime(minutes) {

  minutes = minutes % (24 * 60);

  if (minutes < 0) {
    minutes += 24 * 60;
  }

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return (
    String(h).padStart(2,"0") +
    ":" +
    String(m).padStart(2,"0")
  );
}


function formatTime(time) {

  if (!time) {
    return "TBD";
  }

  const parts =
    time.split(":");

  const hour =
    Number(parts[0]);

  const minute =
    parts[1];

  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  const displayHour =
    hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}


function formatTimeRange(start,end) {

  if (!start) {
    return "TBD";
  }

  if (!end) {
    return formatTime(start);
  }

  return `${formatTime(start)} – ${formatTime(end)}`;
}


function timeRangesOverlap(
  startA,
  endA,
  startB,
  endB
) {

  if (
    !startA ||
    !endA ||
    !startB ||
    !endB
  ) {
    return false;
  }

  let aStart = timeToMinutes(startA);
  let aEnd = timeToMinutes(endA);
  let bStart = timeToMinutes(startB);
  let bEnd = timeToMinutes(endB);

  // Support overnight bookings such as 10:00 PM → 1:00 AM.
  if (aEnd <= aStart) aEnd += 24 * 60;
  if (bEnd <= bStart) bEnd += 24 * 60;

  return (
    aStart < bEnd &&
    aEnd > bStart
  );
}


/* =====================================================
   TIMEZONE GREETING
===================================================== */

function updateGreeting() {

  const greeting =
    $("greeting");

  if (!greeting) {
    return;
  }

  /*
    Uses the browser/device local timezone.
    India = Asia/Kolkata automatically.
  */

  const hour =
    new Date().getHours();


  let text;


  if (
    hour >= 5 &&
    hour < 12
  ) {

    text =
      "GOOD MORNING";

  }

  else if (
    hour >= 12 &&
    hour < 17
  ) {

    text =
      "GOOD AFTERNOON";

  }

  else if (
    hour >= 17 &&
    hour < 21
  ) {

    text =
      "GOOD EVENING";

  }

  else {

    text =
      "GOOD NIGHT";

  }


  greeting.textContent =
    text;
}


updateGreeting();


setInterval(
  updateGreeting,
  60 * 1000
);


/* =====================================================
   AUTH UI
===================================================== */

function showLogin() {

  $("login")
    .classList
    .remove("hidden");

  $("app")
    .classList
    .add("hidden");
}


function showApp() {

  $("login")
    .classList
    .add("hidden");

  $("app")
    .classList
    .remove("hidden");
}


function showLoginPanel() {

  $("loginPanel")
    .classList
    .remove("hidden");

  $("signupPanel")
    .classList
    .add("hidden");
}


function showSignupPanel() {

  $("loginPanel")
    .classList
    .add("hidden");

  $("signupPanel")
    .classList
    .remove("hidden");
}


/* =====================================================
   INITIAL AUTH
===================================================== */

async function initializeAuth() {

  /*
    Force fresh login on page load.
    Remove these two lines if you later want
    persistent login sessions.
  */

  await db.auth.signOut();

  showLogin();


  db.auth.onAuthStateChange(
    async (event,session) => {

      if (
        event === "SIGNED_IN" &&
        session
      ) {

        await handleSignedIn(
          session.user
        );

      }

      if (
        event === "SIGNED_OUT"
      ) {

        currentUser = null;

        staffProfile = null;
        staffUsers = [];

        bookings = [];

        showLogin();

      }

    }
  );
}


async function handleSignedIn(user) {

  currentUser =
    user;


  const { data,error } =
    await db
      .from("staff")
      .select("user_id,full_name,email,status,role,created_at")
      .eq("user_id",user.id)
      .maybeSingle();


  if (error) {

    console.error(error);

    await db.auth.signOut();

    $("loginError").textContent =
      "Unable to verify your account.";

    return;
  }


  if (!data) {

    await db.auth.signOut();

    $("loginError").textContent =
      "Your account is not approved for this dashboard.";

    return;
  }

  if (data.status !== "Approved") {

    await db.auth.signOut();

    $("loginError").textContent =
      data.status === "Disabled"
        ? "Your account has been disabled. Please contact the owner."
        : "Your account is waiting for owner approval.";

    return;
  }


  staffProfile =
    data;


  showApp();


  const name =
    data.full_name ||
    user.email?.split("@")[0] ||
    "Admin";


  $("profileName").textContent =
    name;

  $("welcomeName").textContent =
    name;


  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0,2)
      .map(x => x[0])
      .join("")
      .toUpperCase();


  $("profileInitials").textContent =
    initials || "DT";

  updateOwnerUI();


  await loadBookings();

  await autoCompletePastBookings();

  await loadBookings();

  renderAll();

  updateGreeting();
}


/* =====================================================
   LOGIN
===================================================== */

$("loginForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      $("loginError")
        .textContent =
        "Signing in…";


      const email =
        $("user")
          .value
          .trim();

      const password =
        $("pass")
          .value;


      const { data,error } =
        await db.auth.signInWithPassword({

          email,
          password

        });


      if (error) {

        $("loginError")
          .textContent =
          error.message;

        return;
      }


      await handleSignedIn(
        data.user
      );

    }
  );


$("logout")
  .addEventListener(
    "click",
    async () => {

      await db.auth.signOut();

    }
  );


$("showSignup")
  .addEventListener(
    "click",
    showSignupPanel
  );


$("showLogin")
  .addEventListener(
    "click",
    showLoginPanel
  );


/* =====================================================
   FORGOT PASSWORD
===================================================== */

$("forgot")
  .addEventListener(
    "click",
    async () => {

      const email =
        $("user")
          .value
          .trim();


      if (!email) {

        $("loginError").textContent =
          "Enter your email first.";

        return;
      }


      const redirect =
        window.location.origin +
        window.location.pathname;


      const { error } =
        await db.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: redirect
          }
        );


      $("loginError").textContent =
        error
          ? error.message
          : "Password reset email sent.";

    }
  );


/* =====================================================
   SIGNUP
===================================================== */

$("signupForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      $("signupError")
        .textContent =
        "Creating account…";


      const name =
        $("signupName")
          .value
          .trim();

      const email =
        $("signupEmail")
          .value
          .trim();

      const password =
        $("signupPass")
          .value;


      if (password.length < 8) {

        $("signupError")
          .textContent =
          "Password must contain at least 8 characters.";

        return;
      }


      const { data,error } =
        await db.auth.signUp({

          email,
          password,

          options: {
            data: {
              full_name: name
            }
          }

        });


      if (error) {

        $("signupError")
          .textContent =
          error.message;

        return;
      }


      if (data.user) {

        $("signupError")
          .textContent =
          "Account created. Ask the owner to approve your account.";

        $("signupForm")
          .reset();

      }

    }
  );


/* =====================================================
   LOAD BOOKINGS
===================================================== */

async function loadBookings() {

  if (!currentUser) {
    return;
  }


  const { data,error } =
    await db
      .from("bookings")
      .select("*")
      .order("event_date",{ ascending:true })
      .order("event_time",{ ascending:true });


  if (error) {

    console.error(
      "Booking load error:",
      error
    );

    return;
  }


  bookings =
    (data || []).map(row => ({

      id:
        row.id,

      date:
        row.event_date,

      time:
        row.event_time || "",

      endTime:
        row.event_end_time || "",

      type:
        row.event_type,

      customer:
        row.customer_name || "",

      phone:
        row.phone || "",

      bookedBy:
        row.booked_by,

      notes:
        row.notes || "",

      packageCost:
        row.package_cost ?? "",

      status:
        row.status,

      createdBy:
        row.created_by,

      createdAt:
        row.created_at

    }));

}


/* =====================================================
   AUTOMATIC COMPLETION
   A booking becomes Completed automatically when its
   confirmed end time has passed. Time-unconfirmed and
   cancelled bookings are ignored.
===================================================== */

function getBookingEndDateTime(booking) {

  if (!booking.date || !booking.time || !booking.endTime) {
    return null;
  }

  const startMinutes = timeToMinutes(booking.time);
  let endMinutes = timeToMinutes(booking.endTime);

  const [year, month, day] = booking.date.split("-").map(Number);

  const endDate = new Date(year, month - 1, day);

  if (endMinutes <= startMinutes) {
    endDate.setDate(endDate.getDate() + 1);
  }

  endDate.setHours(
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    0,
    0
  );

  return endDate;
}


async function autoCompletePastBookings() {

  if (!currentUser || !bookings.length) {
    return;
  }

  const now = new Date();

  const due = bookings.filter(booking => {

    if (
      booking.status === "Completed" ||
      booking.status === "Cancelled" ||
      !booking.time ||
      !booking.endTime
    ) {
      return false;
    }

    const endDateTime = getBookingEndDateTime(booking);

    return endDateTime && endDateTime <= now;
  });

  if (!due.length) {
    return;
  }

  const results = await Promise.all(
    due.map(booking =>
      db
        .from("bookings")
        .update({ status: "Completed" })
        .eq("id", booking.id)
    )
  );

  const failed = results.find(result => result.error);

  if (failed) {
    console.error("Automatic completion error:", failed.error);
  }
}


/* Run the completion check every minute while the dashboard is open. */
setInterval(async () => {
  if (!currentUser) return;

  await autoCompletePastBookings();
  await loadBookings();
  renderAll();
}, 60 * 1000);


/* =====================================================
   RENDER ALL
===================================================== */

function renderAll() {

  renderStats();

  renderUpcoming();

  renderCalendar();

  renderBookings();

  renderAvailability();

  renderCustomers();

  renderReports();

}


/* =====================================================
   STATS
===================================================== */

function renderStats() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    now.getMonth();


  const active =
    bookings.filter(
      b =>
        b.status !== "Cancelled"
    );


  const thisMonth =
    active.filter(b => {

      const d =
        new Date(
          b.date + "T00:00:00"
        );

      return (
        d.getFullYear() === year &&
        d.getMonth() === month
      );

    });


  const upcoming =
    active.filter(b => {

      return (
        new Date(
          b.date + "T23:59:59"
        ) >= now
      );

    });


  const customerSet =
    new Set(
      active
        .map(b => b.phone || b.customer)
        .filter(Boolean)
    );


  $("total").textContent =
    active.length;

  $("month").textContent =
    thisMonth.length;

  $("upcoming").textContent =
    upcoming.length;

  $("customers").textContent =
    customerSet.size;

}


/* =====================================================
   EVENT ICON
===================================================== */

function eventIcon(type) {

  if (
    type
      .toLowerCase()
      .includes("birthday")
  ) {
    return "🎂";
  }

  if (
    type
      .toLowerCase()
      .includes("bride")
  ) {
    return "👰";
  }

  if (
    type
      .toLowerCase()
      .includes("proposal")
  ) {
    return "💍";
  }

  if (
    type
      .toLowerCase()
      .includes("anniversary")
  ) {
    return "♥";
  }

  if (
    type
      .toLowerCase()
      .includes("romantic")
  ) {
    return "♥";
  }

  if (
    type
      .toLowerCase()
      .includes("welcome")
  ) {
    return "✦";
  }

  return "✿";
}


/* =====================================================
   UPCOMING
===================================================== */

function renderUpcoming() {

  const container =
    $("upcomingList");


  const today =
    new Date();

  today.setHours(
    0,0,0,0
  );


  const list =
    bookings

      .filter(b =>
        b.status !== "Cancelled"
      )

      .filter(b => {

        const d =
          new Date(
            b.date + "T00:00:00"
          );

        return d >= today;

      })

      .sort((a,b) => {

        const aa =
          `${a.date} ${a.time}`;

        const bb =
          `${b.date} ${b.time}`;

        return aa.localeCompare(bb);

      })

      .slice(0,5);


  if (!list.length) {

    container.innerHTML =
      `<div class="empty">
        No upcoming bookings.
      </div>`;

    return;
  }


  container.innerHTML =
    list.map(b => {

      return `

        <div class="booking">

          <div class="thumb">
            ${eventIcon(b.type)}
          </div>

          <div>

            <b>
              ${escapeHTML(
                b.type
              )}
            </b>

            <div class="sub">
              ${escapeHTML(
                b.customer || "Customer not added"
              )}
            </div>

          </div>

          <div class="meta">

            <b>
              ${escapeHTML(
                formatDate(b.date)
              )}
            </b>

            <br>

            ${escapeHTML(
              b.time
                ? formatTimeRange(b.time, b.endTime)
                : "Time Yet to be Confirmed"
            )}

          </div>

          <div class="meta">

            Booked by<br>

            <b>
              ${escapeHTML(
                b.bookedBy
              )}
            </b>

          </div>

          <div>

            <span class="badge">
              ${escapeHTML(
                b.status
              )}
            </span>

          </div>

        </div>

      `;

    }).join("");

}


/* =====================================================
   DATE FORMAT
===================================================== */

function formatDate(dateString) {

  if (!dateString) {
    return "";
  }

  const d =
    new Date(
      dateString + "T00:00:00"
    );


  return d.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}


/* =====================================================
   CALENDAR
===================================================== */

function renderCalendar() {

  const year =
    calendarDate.getFullYear();

  const month =
    calendarDate.getMonth();


  $("calTitle").textContent =
    calendarDate.toLocaleDateString(
      "en-IN",
      {
        month: "long",
        year: "numeric"
      }
    );


  const first =
    new Date(
      year,
      month,
      1
    );


  const last =
    new Date(
      year,
      month + 1,
      0
    );


  const container =
    $("days");


  container.innerHTML = "";


  for (
    let i = 0;
    i < first.getDay();
    i++
  ) {

    const blank =
      document.createElement("span");

    container.appendChild(blank);

  }


  for (
    let day = 1;
    day <= last.getDate();
    day++
  ) {

    const button =
      document.createElement("button");


    const date =
      `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;


    button.textContent =
      day;


    const today =
      new Date();


    if (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    ) {

      button.classList.add("today");

    }


    if (
      bookings.some(
        b =>
          b.date === date &&
          b.status !== "Cancelled"
      )
    ) {

      button.classList.add("booked");

    }


    button.addEventListener(
      "click",
      () => {

        openModal(
          date
        );

      }
    );


    container.appendChild(button);

  }

}


$("prev")
  .addEventListener(
    "click",
    () => {

      calendarDate =
        new Date(
          calendarDate.getFullYear(),
          calendarDate.getMonth() - 1,
          1
        );

      renderCalendar();

    }
  );


$("next")
  .addEventListener(
    "click",
    () => {

      calendarDate =
        new Date(
          calendarDate.getFullYear(),
          calendarDate.getMonth() + 1,
          1
        );

      renderCalendar();

    }
  );


/* =====================================================
   BOOKINGS TABLE
===================================================== */

function renderBookings() {

  const container =
    $("allBookings");


  const search =
    (
      $("filter")?.value ||
      $("search")?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  let list =
    [...bookings];


  if (search) {

    list =
      list.filter(b => {

        const searchable = [

          b.type,
          b.bookedBy,
          b.customer,
          b.phone,
          b.date,
          b.time,
          b.endTime,
          b.packageCost,
          formatTime(b.time),
          formatTime(b.endTime),
          b.status

        ]
          .join(" ")
          .toLowerCase();


        return searchable.includes(
          search
        );

      });

  }


  list.sort((a,b) => {

    const aa =
      `${a.date} ${a.time}`;

    const bb =
      `${b.date} ${b.time}`;

    return bb.localeCompare(aa);

  });


  if (!list.length) {

    container.innerHTML =
      `<div class="empty">
        No bookings found.
      </div>`;

    return;
  }


  container.innerHTML =
    list.map(b => {

      return `

        <div class="fullrow">

          <div>

            <strong>
              ${escapeHTML(
                formatDate(b.date)
              )}
            </strong>

          </div>


          <div>

            <strong>
              ${escapeHTML(
                b.type
              )}
            </strong>

            <div class="sub">

              ${escapeHTML(
                b.customer ||
                "No customer"
              )}

            </div>

            ${b.packageCost !== "" && b.packageCost !== null && b.packageCost !== undefined ? `
              <div class="package-cost-small">
                ₹${Number(b.packageCost).toLocaleString("en-IN")}
              </div>
            ` : ""}

          </div>


          <div>

            <strong>
              ${escapeHTML(
                b.bookedBy
              )}
            </strong>

            <div class="sub">

              ${escapeHTML(
                b.phone ||
                "No phone"
              )}

            </div>

          </div>


          <div>

            ${escapeHTML(
              formatTimeRange(
                b.time,
                b.endTime
              )
            )}

          </div>


          <div>

            <span class="badge status-${String(b.status).toLowerCase()}">

              ${escapeHTML(
                b.status
              )}

            </span>

          </div>


          <div class="row-actions">

            <button
              class="mini"
              onclick="editBooking('${b.id}')"
            >
              Edit
            </button>

            <button
              class="mini danger"
              onclick="deleteBooking('${b.id}')"
            >
              Delete
            </button>

          </div>

        </div>

      `;

    }).join("");

}


/* =====================================================
   SEARCH
===================================================== */

$("filter")
  .addEventListener(
    "input",
    renderBookings
  );


$("search")
  .addEventListener(
    "input",
    event => {

      const value =
        event.target.value;


      $("filter").value =
        value;


      if (value) {
        showPage("bookings");
      }

      renderBookings();

    }
  );


/* =====================================================
   MODAL
===================================================== */

function openModal(
  selectedDate = ""
) {

  $("modal")
    .classList
    .remove("hidden");

  $("bookingForm")
    .reset();

  $("editId").value = "";

  $("modalTitle").textContent =
    "Create New Booking";

  $("formError").textContent =
    "";

  $("status").value =
    "Confirmed";

  $("timeStatus").value =
    "confirmed";

  $("type").value =
    "Anniversary Surprise";

  $("customEventName").value = "";
  updateCustomEventUI();

  $("packageCost").value = "";
  $("customPackageCost").value = "";
  updatePackageCostUI();

  $("bookedBy").value =
    staffProfile?.full_name ||
    "";

  if (selectedDate) {
    $("date").value = selectedDate;
  }

  $("time").value = "";
  $("endTime").value = "";

  selectedStartTime = null;
  selectedEndTime = null;

  initializeBookingTimePicker();
  setBookingTimePicker("Start", null);
  setBookingTimePicker("End", null);
  updateTimeStatusUI();

}

function closeModal() {

  $("modal")
    .classList
    .add("hidden");

}


$("close")
  .addEventListener(
    "click",
    closeModal
  );


$("cancelModal")
  .addEventListener(
    "click",
    closeModal
  );


$("modal")
  .addEventListener(
    "click",
    event => {

      if (
        event.target === $("modal")
      ) {

        closeModal();

      }

    }
  );


/* =====================================================
   CUSTOM EVENT NAME
===================================================== */

const standardEventTypes = [
  "Anniversary Surprise",
  "Birthday Surprise",
  "Bride to Be",
  "Proposal Surprise",
  "Romantic Setup",
  "Welcome Surprise",
  "Custom Event"
];

function updateCustomEventUI() {

  const typeSelect = $("type");
  const customInput = $("customEventName");

  if (!typeSelect || !customInput) return;

  const isCustom = typeSelect.value === "Custom Event";

  customInput.classList.toggle("hidden", !isCustom);
  customInput.required = isCustom;

  if (isCustom) {
    customInput.focus();
  } else {
    customInput.value = "";
  }
}

$("type")?.addEventListener("change", updateCustomEventUI);

function getSelectedEventType() {

  const typeSelect = $("type");
  const customInput = $("customEventName");

  if (!typeSelect) return "";

  if (typeSelect.value === "Custom Event") {
    return customInput?.value.trim() || "";
  }

  return typeSelect.value;
}

/* =====================================================
   PACKAGE COST
===================================================== */

function getSelectedPackageCost() {

  const packageSelect = $("packageCost");
  const customInput = $("customPackageCost");

  if (!packageSelect) return "";

  if (packageSelect.value === "custom") {
    return customInput?.value.trim() || "";
  }

  return packageSelect.value || "";
}

function updatePackageCostUI() {

  const packageSelect = $("packageCost");
  const customInput = $("customPackageCost");

  if (!packageSelect || !customInput) return;

  const isCustom = packageSelect.value === "custom";

  customInput.classList.toggle("hidden", !isCustom);
  customInput.required = isCustom;

  if (!isCustom) {
    customInput.value = "";
  }
}

$("packageCost")?.addEventListener(
  "change",
  updatePackageCostUI
);


/* =====================================================
   SAVE BOOKING
===================================================== */

$("bookingForm")
  .addEventListener(
    "submit",
    saveBooking
  );


async function saveBooking(event) {

  event.preventDefault();

  const id = $("editId").value;
  const timeStatus = $("timeStatus").value;

  const b = {

    type: getSelectedEventType(),
    date: $("date").value,
    time: $("time").value,
    endTime: $("endTime").value,
    timeStatus,
    packageCost: getSelectedPackageCost(),
    bookedBy: $("bookedBy").value.trim(),
    customer: $("customer").value.trim(),
    phone: $("phone").value.trim(),
    status: $("status").value,
    notes: $("notes").value.trim()

  };

  if (!b.date) {
    $("formError").textContent = "Please select a date.";
    return;
  }

  if (!b.type) {
    $("formError").textContent = "Please enter the custom event name.";
    $("customEventName")?.focus();
    return;
  }

  /* Time is required only when confirmed. */
  if (timeStatus === "confirmed") {

    if (!b.time) {
      $("formError").textContent = "Please select a start time.";
      return;
    }

    if (!b.endTime) {
      $("formError").textContent = "Please select an end time.";
      return;
    }

    const startMinutes = timeToMinutes(b.time);
    let endMinutes = timeToMinutes(b.endTime);

    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    if (endMinutes - startMinutes < 30) {
      $("formError").textContent = "Minimum booking duration is 30 minutes.";
      return;
    }

    const duplicate = bookings.find(x => {

      if (
        x.id === id ||
        x.date !== b.date ||
        x.status === "Cancelled" ||
        !x.time ||
        !x.endTime
      ) {
        return false;
      }

      return timeRangesOverlap(
        b.time,
        b.endTime,
        x.time,
        x.endTime
      );

    });

    if (duplicate) {
      $("formError").textContent =
        `This time overlaps with ${duplicate.bookedBy}'s booking (${formatTimeRange(duplicate.time, duplicate.endTime)}).`;
      return;
    }

  }

  $("formError").textContent = "Saving booking…";

  const row = {

    event_date: b.date,

    event_time: timeStatus === "confirmed" ? b.time : null,

    event_end_time: timeStatus === "confirmed" ? b.endTime : null,

    event_type: b.type,
    package_cost: b.packageCost === "" ? null : Number(b.packageCost),
    booked_by: b.bookedBy,
    customer_name: b.customer || null,
    phone: b.phone || null,
    status: b.status,
    notes: b.notes || null

  };

  let result;

  if (id) {

    result = await db
      .from("bookings")
      .update(row)
      .eq("id", id)
      .select()
      .single();

  } else {

    result = await db
      .from("bookings")
      .insert({
        ...row,
        created_by: currentUser.id
      })
      .select()
      .single();

  }

  if (result.error) {
    $("formError").textContent = result.error.message;
    return;
  }

  closeModal();
  await loadBookings();
  renderAll();

}

/* =====================================================
   EDIT
===================================================== */

window.editBooking =
  function(id) {

    const b = bookings.find(x => x.id === id);

    if (!b) {
      return;
    }

    $("modal").classList.remove("hidden");

    $("modalTitle").textContent = "Edit Booking";
    $("editId").value = b.id;

    if (standardEventTypes.includes(b.type)) {
      $("type").value = b.type;
      $("customEventName").value = "";
    } else {
      $("type").value = "Custom Event";
      $("customEventName").value = b.type || "";
    }
    updateCustomEventUI();

    const savedPackageCost = String(b.packageCost ?? "");
    const packageOptions = ["", "999", "1499", "1999"];

    if (packageOptions.includes(savedPackageCost)) {
      $("packageCost").value = savedPackageCost;
      $("customPackageCost").value = "";
    } else if (savedPackageCost) {
      $("packageCost").value = "custom";
      $("customPackageCost").value = savedPackageCost;
    } else {
      $("packageCost").value = "";
      $("customPackageCost").value = "";
    }

    updatePackageCostUI();

    $("status").value = b.status;
    $("date").value = b.date;
    $("timeStatus").value = b.time ? "confirmed" : "pending";
    $("time").value = b.time || "";
    $("endTime").value = b.endTime || "";
    $("bookedBy").value = b.bookedBy;
    $("customer").value = b.customer;
    $("phone").value = b.phone;
    $("notes").value = b.notes;
    $("formError").textContent = "";

    initializeBookingTimePicker();
    setBookingTimePicker("Start", b.time || null);
    setBookingTimePicker("End", b.endTime || null);
    updateTimeStatusUI();

  };

/* =====================================================
   DELETE
===================================================== */

window.deleteBooking =
  async function(id) {

    const booking =
      bookings.find(
        x => x.id === id
      );


    if (!booking) {
      return;
    }


    const ok =
      confirm(
        `Delete booking for ${booking.customer || "this customer"}?`
      );


    if (!ok) {
      return;
    }


    const { error } =
      await db
        .from("bookings")
        .delete()
        .eq("id",id);


    if (error) {

      alert(
        error.message
      );

      return;
    }


    await loadBookings();

    renderAll();

  };


/* =====================================================
   AVAILABILITY
   365 DAYS + 30-MINUTE TIME GRID
===================================================== */

function renderAvailability() {

  if (!selectedAvailabilityDate) {
    selectedAvailabilityDate = getLocalDateString();
  }

  renderAvailabilityDates();
  renderAvailabilitySlots();

}


function getLocalDateString() {

  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2,"0"),
    String(now.getDate()).padStart(2,"0")
  ].join("-");

}


/* =====================================================
   AVAILABILITY DATE STRIP
   NEXT 365 DAYS
===================================================== */

function renderAvailabilityDates() {

  const container = $("availDays");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const base = new Date();

  for (let i = 0; i < 365; i++) {

    const date = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + i
    );

    const dateString = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2,"0"),
      String(date.getDate()).padStart(2,"0")
    ].join("-");

    const button = document.createElement("button");

    button.type = "button";
    button.className = "availability-date";

    if (dateString === selectedAvailabilityDate) {
      button.classList.add("selected");
    }

    button.innerHTML = `
      <span class="day-name">
        ${date.toLocaleDateString("en-IN", { weekday:"short" })}
      </span>

      <span class="day-number">
        ${date.getDate()}
      </span>

      <span class="month-name">
        ${date.toLocaleDateString("en-IN", { month:"short" })}
      </span>
    `;

    button.addEventListener("click", () => {

      selectedAvailabilityDate = dateString;
      selectedStartTime = null;
      selectedEndTime = null;

      renderAvailability();

    });

    container.appendChild(button);
  }

}


/* =====================================================
   CHECK BOOKED TIME
===================================================== */

function getPreviousDateString(dateString) {

  const d = new Date(dateString + "T00:00:00");

  d.setDate(d.getDate() - 1);

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");

}


function isTimeBooked(date, time) {

  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + 30;

  const previousDate = getPreviousDateString(date);

  return bookings.some(b => {

    /*
      Cancelled and time-unconfirmed bookings do not
      block any availability slot.
    */
    if (b.status === "Cancelled" || !b.time) {
      return false;
    }

    const bookingStart = timeToMinutes(b.time);
    let bookingEnd = b.endTime
      ? timeToMinutes(b.endTime)
      : bookingStart + 30;

    /*
      A booking whose end is earlier than/equal to its start
      is an overnight booking. Move its end into the next day.
    */
    if (bookingEnd <= bookingStart) {
      bookingEnd += 24 * 60;
    }

    /* Same-day booking. */
    if (b.date === date) {

      return (
        slotStart < bookingEnd &&
        slotEnd > bookingStart
      );

    }

    /*
      Early-morning portion of an overnight booking made on
      the previous date. The current day's slot is shifted
      into the next-day timeline.
    */
    if (b.date === previousDate && bookingEnd > 24 * 60) {

      const currentDaySlotStart =
        slotStart + 24 * 60;

      const currentDaySlotEnd =
        slotEnd + 24 * 60;

      return (
        currentDaySlotStart < bookingEnd &&
        currentDaySlotEnd > bookingStart
      );

    }

    return false;

  });

}



/* =====================================================
   AVAILABILITY TIME GRID
===================================================== */

function availabilityHourOptions() {

  let html = '<option value="">HH</option>';

  for (let h = 1; h <= 12; h++) {
    html += `<option value="${String(h).padStart(2,"0")}">${String(h).padStart(2,"0")}</option>`;
  }

  return html;

}


function availabilityMinuteOptions() {

  let html = '<option value="">MM</option>';

  for (let m = 0; m < 60; m++) {
    html += `<option value="${String(m).padStart(2,"0")}">${String(m).padStart(2,"0")}</option>`;
  }

  return html;

}


function availabilityPeriodOptions() {

  return `
    <option value="">AM/PM</option>
    <option value="AM">AM</option>
    <option value="PM">PM</option>
  `;

}


function availabilityTimeToParts(time) {

  if (!time) {
    return {
      hour: "",
      minute: "",
      period: ""
    };
  }

  const total = timeToMinutes(time);
  const hour24 = Math.floor(total / 60) % 24;
  const minute = total % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    hour: String(hour12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    period
  };

}


function availabilityPartsToTime(hour, minute, period) {

  if (!hour || minute === "" || !period) {
    return null;
  }

  let h = Number(hour);
  const m = Number(minute);

  if (period === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return minutesToTime((h * 60) + m);

}


function setAvailabilityPicker(prefix, time) {

  const parts = availabilityTimeToParts(time);

  const hour = $(`avail${prefix}Hour`);
  const minute = $(`avail${prefix}Minute`);
  const period = $(`avail${prefix}Period`);

  if (!hour || !minute || !period) return;

  hour.value = parts.hour;
  minute.value = parts.minute;
  period.value = parts.period;

}


function getAvailabilityPickerTime(prefix) {

  const hour = $(`avail${prefix}Hour`);
  const minute = $(`avail${prefix}Minute`);
  const period = $(`avail${prefix}Period`);

  if (!hour || !minute || !period) return null;

  return availabilityPartsToTime(
    hour.value,
    minute.value,
    period.value
  );

}


function availabilityTimeIsInBusinessWindow(time) {

  if (!time) return false;

  const minutes = timeToMinutes(time);
  const start = 10 * 60;
  const end = 25 * 60;

  let value = minutes;

  if (value < start) {
    value += 24 * 60;
  }

  return value >= start && value <= end;

}


function renderAvailabilitySlots() {

  const container = $("availInfo");

  if (!container || !selectedAvailabilityDate) {
    return;
  }

  let html = `
    <div class="availability-clock-panel">

      <div class="availability-clock-group">

        <label>Start Time</label>

        <div class="availability-clock-row">

          <select id="availStartHour" aria-label="Start hour">
            ${availabilityHourOptions()}
          </select>

          <span class="clock-colon">:</span>

          <select id="availStartMinute" aria-label="Start minute">
            ${availabilityMinuteOptions()}
          </select>

          <select id="availStartPeriod" aria-label="Start AM or PM">
            ${availabilityPeriodOptions()}
          </select>

        </div>

      </div>

      <div class="availability-clock-arrow">→</div>

      <div class="availability-clock-group">

        <label>End Time</label>

        <div class="availability-clock-row">

          <select id="availEndHour" aria-label="End hour">
            ${availabilityHourOptions()}
          </select>

          <span class="clock-colon">:</span>

          <select id="availEndMinute" aria-label="End minute">
            ${availabilityMinuteOptions()}
          </select>

          <select id="availEndPeriod" aria-label="End AM or PM">
            ${availabilityPeriodOptions()}
          </select>

        </div>

      </div>

      <button
        type="button"
        class="availability-check-btn"
        id="checkAvailabilityBtn"
      >
        Check Availability
      </button>

    </div>

    <p class="availability-help">
      Choose any time from 10:00 AM to 1:00 AM. You can select every minute.
    </p>

    <div id="availabilityCheckResult"></div>

    <div class="availability-header">

      <div>
        <span class="section-label">SELECT TIME</span>
        <h2>${formatDate(selectedAvailabilityDate)}</h2>
      </div>

      <p class="availability-instruction">
        Tap a time to start, then tap another to set how long you need.
      </p>

    </div>

    <div class="availability-time-grid">
  `;

  /* 10:00 AM to 1:00 AM next day, every 30 minutes */
  for (let minutes = 10 * 60; minutes <= 25 * 60; minutes += 30) {

    const time = minutesToTime(minutes);
    const booked = isTimeBooked(selectedAvailabilityDate, time);
    const isStart = selectedStartTime === time;
    const isEnd = selectedEndTime === time;

    let disabled = booked;

    if (selectedStartTime && !selectedEndTime) {

      const startMinutes = timeToMinutes(selectedStartTime);
      let currentMinutes = timeToMinutes(time);

      if (currentMinutes <= startMinutes) {
        currentMinutes += 24 * 60;
      }

      if (currentMinutes < startMinutes + 30) {
        disabled = true;
      }

    }

    let classes = "availability-time";

    if (booked) classes += " booked";
    if (isStart) classes += " start-selected";
    if (isEnd) classes += " end-selected";

    html += `
      <button
        type="button"
        class="${classes}"
        data-availability-time="${time}"
        ${disabled ? "disabled" : ""}
      >
        ${formatTime(time)}
      </button>
    `;

  }

  html += `</div>`;

  if (selectedStartTime) {

    html += `
      <div class="availability-selection">

        <div class="availability-selected-times">

          <div>
            <span>START TIME</span>
            <strong>${formatTime(selectedStartTime)}</strong>
          </div>

          <div class="selection-arrow">→</div>

          <div>
            <span>END TIME</span>
            <strong>
              ${selectedEndTime ? formatTime(selectedEndTime) : "Select end"}
            </strong>
          </div>

        </div>

        ${selectedEndTime ? `
          <button
            type="button"
            class="create"
            id="availabilityContinueBtn"
          >
            Continue Booking →
          </button>
        ` : `
          <div class="availability-next">
            Now select the end time.
          </div>
        `}

      </div>
    `;
  }

  container.innerHTML = html;

  /* Restore the selected values into the 12-hour controls. */
  setAvailabilityPicker("Start", selectedStartTime);
  setAvailabilityPicker("End", selectedEndTime);

  /*
    IMPORTANT:
    Do NOT re-render while the user is selecting HH, MM,
    and AM/PM. Re-rendering here was resetting the dropdowns
    before the user could finish selecting a time.

    Each selector now updates only its own time.
    The selected time is stored only after all three values
    (HH + MM + AM/PM) have been chosen.
  */

  [
    ["availStartHour", "availStartMinute", "availStartPeriod", "Start"],
    ["availEndHour", "availEndMinute", "availEndPeriod", "End"]
  ].forEach(config => {

    const hour = $(config[0]);
    const minute = $(config[1]);
    const period = $(config[2]);
    const prefix = config[3];

    [hour, minute, period].forEach(element => {

      if (!element) {
        return;
      }

      element.addEventListener("change", () => {

        const time =
          getAvailabilityPickerTime(prefix);

        /*
          Only save once HH + MM + AM/PM are complete.
          Do not render here.
        */
        if (time) {
          if (prefix === "Start") {
            selectedStartTime = time;
          } else {
            selectedEndTime = time;
          }
        }

      });

    });

  });

  container
    .querySelectorAll("[data-availability-time]")
    .forEach(button => {

      button.addEventListener("click", () => {
        selectAvailabilityTime(button.dataset.availabilityTime);
      });

    });

  const checkButton = $("checkAvailabilityBtn");

  if (checkButton) {

    checkButton.addEventListener("click", checkAvailabilityFromPicker);

  }

  const continueButton = $("availabilityContinueBtn");

  if (continueButton) {

    continueButton.addEventListener("click", bookSelectedAvailability);

  }

}


function checkAvailabilityFromPicker() {

  const start = getAvailabilityPickerTime("Start");
  const end = getAvailabilityPickerTime("End");
  const result = $("availabilityCheckResult");

  if (!start || !end) {

    if (result) {
      result.className = "availability-status unavailable";
      result.textContent = "Please select both start and end time.";
    }

    return;
  }

  if (!availabilityTimeIsInBusinessWindow(start) || !availabilityTimeIsInBusinessWindow(end)) {

    if (result) {
      result.className = "availability-status unavailable";
      result.textContent = "Please choose a time between 10:00 AM and 1:00 AM.";
    }

    return;
  }

  let startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  if (endMinutes - startMinutes < 30) {

    if (result) {
      result.className = "availability-status unavailable";
      result.textContent = "Minimum booking duration is 30 minutes.";
    }

    return;
  }

  for (let t = startMinutes; t < endMinutes; t += 30) {

    if (isTimeBooked(selectedAvailabilityDate, minutesToTime(t))) {

      if (result) {
        result.className = "availability-status unavailable";
        result.textContent = "This time range is not available.";
      }

      return;
    }

  }

  selectedStartTime = start;
  selectedEndTime = end;

  if (result) {
    result.className = "availability-status available";
    result.textContent = `Available: ${formatTime(start)} – ${formatTime(end)}`;
  }

  renderAvailabilitySlots();

}


/* =====================================================
   AVAILABILITY TIME SELECTION
===================================================== */

window.selectAvailabilityTime = function(time) {

  /* First click = start */
  if (!selectedStartTime || selectedEndTime) {

    selectedStartTime = time;
    selectedEndTime = null;

    renderAvailability();
    return;
  }

  const start = timeToMinutes(selectedStartTime);
  let end = timeToMinutes(time);

  /*
    Support overnight selection.
    Example: 10:00 PM → 1:00 AM.
  */
  if (end <= start) {
    end += 24 * 60;
  }

  if (end - start < 30) {
    alert("Minimum booking duration is 30 minutes.");
    return;
  }

  /* Check every 30-minute block in the requested range. */
  for (let t = start; t < end; t += 30) {

    if (isTimeBooked(selectedAvailabilityDate, minutesToTime(t))) {

      alert("This time range contains an already booked time.");

      selectedEndTime = null;
      renderAvailability();
      return;
    }

  }

  selectedEndTime = time;

  renderAvailability();

};


window.bookSelectedAvailability = function() {

  if (!selectedStartTime || !selectedEndTime) {
    return;
  }

  openModal(selectedAvailabilityDate);

  $("time").value = selectedStartTime;
  $("endTime").value = selectedEndTime;

  initializeBookingTimePicker();
  setBookingTimePicker("Start", selectedStartTime);
  setBookingTimePicker("End", selectedEndTime);
  updateTimeStatusUI();

};


/* =====================================================
   SHARED 12-HOUR TIME PICKER
   Used in BOTH Add Booking and Availability.
   12-hour clock + AM/PM + every minute.
===================================================== */

function bookingHourOptions() {
  return availabilityHourOptions();
}

function bookingMinuteOptions() {
  return availabilityMinuteOptions();
}

function bookingPeriodOptions() {
  return availabilityPeriodOptions();
}

function initializeBookingTimePicker() {

  const controls = [
    ["bookingStartHour", "bookingStartMinute", "bookingStartPeriod"],
    ["bookingEndHour", "bookingEndMinute", "bookingEndPeriod"]
  ];

  controls.forEach(ids => {

    const hour = $(ids[0]);
    const minute = $(ids[1]);
    const period = $(ids[2]);

    if (!hour || !minute || !period) {
      return;
    }

    hour.innerHTML = bookingHourOptions();
    minute.innerHTML = bookingMinuteOptions();
    period.innerHTML = bookingPeriodOptions();

    [hour, minute, period].forEach(element => {
      element.onchange = () => {
        syncBookingPickerToHidden(ids[0].includes("Start") ? "Start" : "End");
      };
    });

  });

}

function setBookingTimePicker(prefix, time) {

  const parts = availabilityTimeToParts(time);

  const hour = $(prefix === "Start" ? "bookingStartHour" : "bookingEndHour");
  const minute = $(prefix === "Start" ? "bookingStartMinute" : "bookingEndMinute");
  const period = $(prefix === "Start" ? "bookingStartPeriod" : "bookingEndPeriod");

  if (!hour || !minute || !period) {
    return;
  }

  hour.value = parts.hour;
  minute.value = parts.minute;
  period.value = parts.period;

}

function getBookingTimePicker(prefix) {

  const hour = $(prefix === "Start" ? "bookingStartHour" : "bookingEndHour");
  const minute = $(prefix === "Start" ? "bookingStartMinute" : "bookingEndMinute");
  const period = $(prefix === "Start" ? "bookingStartPeriod" : "bookingEndPeriod");

  if (!hour || !minute || !period) {
    return null;
  }

  return availabilityPartsToTime(
    hour.value,
    minute.value,
    period.value
  );

}

function syncBookingPickerToHidden(prefix) {

  const time = getBookingTimePicker(prefix);
  const hidden = $(prefix === "Start" ? "time" : "endTime");

  if (hidden) {
    hidden.value = time || "";
  }

}

function updateTimeStatusUI() {

  const status = $("timeStatus");
  const startField = $("startTimeField");
  const endField = $("endTimeField");

  if (!status || !startField || !endField) {
    return;
  }

  const disabled = status.value === "pending";

  startField.classList.toggle("time-not-required", disabled);
  endField.classList.toggle("time-not-required", disabled);

  if (disabled) {
    $("time").value = "";
    $("endTime").value = "";
    setBookingTimePicker("Start", null);
    setBookingTimePicker("End", null);
  }

  [
    "bookingStartHour",
    "bookingStartMinute",
    "bookingStartPeriod",
    "bookingEndHour",
    "bookingEndMinute",
    "bookingEndPeriod"
  ].forEach(id => {
    const element = $(id);
    if (element) {
      element.disabled = disabled;
    }
  });

}

$("timeStatus")?.addEventListener("change", updateTimeStatusUI);

/* =====================================================
   CUSTOMERS
===================================================== */

function renderCustomers() {

  const container =
    $("customerGrid");


  if (!container) {
    return;
  }


  const map =
    new Map();


  bookings.forEach(b => {

    const key =
      b.phone ||
      b.customer ||
      "Unknown";


    if (!map.has(key)) {

      map.set(
        key,
        {
          name:
            b.customer ||
            "Unknown Customer",

          phone:
            b.phone ||
            "",

          bookings:
            0
        }
      );

    }


    map.get(key).bookings++;

  });


  const list =
    [...map.values()];


  if (!list.length) {

    container.innerHTML =
      `<div class="empty">
        No customers yet.
      </div>`;

    return;
  }


  container.innerHTML =
    list.map(c => {

      const initials =
        c.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0,2)
          .map(x => x[0])
          .join("")
          .toUpperCase();


      return `

        <div class="customer-card">

          <div class="customer-avatar">

            ${escapeHTML(
              initials || "C"
            )}

          </div>

          <h3>
            ${escapeHTML(
              c.name
            )}
          </h3>

          <p>
            ${escapeHTML(
              c.phone ||
              "No phone number"
            )}
          </p>

          <p>
            ${c.bookings}
            booking${c.bookings === 1 ? "" : "s"}
          </p>

        </div>

      `;

    }).join("");

}


/* =====================================================
   REPORTS
===================================================== */

function renderReports() {

  const container =
    $("reportsGrid");


  if (!container) {
    return;
  }


  const active =
    bookings.filter(
      b =>
        b.status !== "Cancelled"
    );


  const confirmed =
    bookings.filter(
      b =>
        b.status === "Confirmed"
    );


  const completed =
    bookings.filter(
      b =>
        b.status === "Completed"
    );


  const cancelled =
    bookings.filter(
      b =>
        b.status === "Cancelled"
    );


  container.innerHTML = `

    <div class="report-card">

      <strong>
        ${active.length}
      </strong>

      <span>
        Active Bookings
      </span>

    </div>


    <div class="report-card">

      <strong>
        ${confirmed.length}
      </strong>

      <span>
        Confirmed
      </span>

    </div>


    <div class="report-card">

      <strong>
        ${completed.length}
      </strong>

      <span>
        Completed
      </span>

    </div>


    <div class="report-card">

      <strong>
        ${cancelled.length}
      </strong>

      <span>
        Cancelled
      </span>

    </div>


    <div class="report-card">

      <strong>
        ${new Set(
          active
            .map(b => b.phone || b.customer)
            .filter(Boolean)
        ).size}
      </strong>

      <span>
        Unique Customers
      </span>

    </div>


    <div class="report-card">

      <strong>
        ${active.filter(
          b =>
            b.type ===
            "Birthday Surprise"
        ).length}
      </strong>

      <span>
        Birthday Surprises
      </span>

    </div>

  `;

}


/* =====================================================
   STAFF / USERS
===================================================== */

function isOwner() {
  return staffProfile?.role === "Owner";
}

function updateOwnerUI() {

  const nav = $("staffNav");
  const page = $("staff");
  const owner = isOwner();

  nav?.classList.toggle("hidden", !owner);

  if (page && !owner) {
    page.classList.add("hidden");
  }

}

async function loadStaffUsers() {

  if (!isOwner()) return;

  const { data, error } = await db
    .from("staff")
    .select("user_id,full_name,email,status,role,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Staff load error:", error);
    if ($("staffMessage")) {
      $("staffMessage").textContent = error.message;
    }
    return;
  }

  staffUsers = data || [];
  renderStaffUsers();

}

function renderStaffUsers() {

  if (!isOwner()) return;

  const pending = staffUsers.filter(
    user => user.status === "Pending"
  );

  const approved = staffUsers.filter(
    user =>
      user.status === "Approved" &&
      user.role !== "Owner"
  );

  const disabled = staffUsers.filter(
    user =>
      user.status === "Disabled" &&
      user.role !== "Owner"
  );

  $("pendingStaffCount").textContent = pending.length;
  $("approvedStaffCount").textContent = approved.length;

  $("pendingStaffList").innerHTML =
    pending.length
      ? pending.map(user => staffUserHTML(user, "pending")).join("")
      : `<div class="staff-empty">No pending account requests.</div>`;

  $("approvedStaffList").innerHTML =
    [...approved, ...disabled].length
      ? [
          ...approved.map(user => staffUserHTML(user, "approved")),
          ...disabled.map(user => staffUserHTML(user, "disabled"))
        ].join("")
      : `<div class="staff-empty">No staff users yet.</div>`;

}

function staffUserHTML(user, view) {

  const name = user.full_name || user.email || "Unnamed user";
  const email = user.email || "Email unavailable";
  const created = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-IN")
    : "";

  let actions = "";

  if (view === "pending") {
    actions = `
      <div class="staff-actions">
        <button
          type="button"
          class="staff-action approve"
          onclick="approveStaff('${user.user_id}')"
        >Approve</button>
      </div>`;
  } else if (view === "approved") {
    actions = `
      <div class="staff-actions">
        <button
          type="button"
          class="staff-action disable"
          onclick="disableStaff('${user.user_id}')"
        >Disable</button>
      </div>`;
  } else {
    actions = `
      <div class="staff-actions">
        <button
          type="button"
          class="staff-action enable"
          onclick="approveStaff('${user.user_id}')"
        >Re-enable</button>
      </div>`;
  }

  return `
    <div class="staff-user">
      <div class="staff-user-main">
        <div class="staff-user-name">${escapeHTML(name)}</div>
        <div class="staff-user-email">${escapeHTML(email)}</div>
        <div class="staff-user-meta">Created ${escapeHTML(created)}</div>
        <span class="staff-status ${
          view === "disabled" ? "disabled" : "approved"
        }">
          ${view === "pending" ? "PENDING" : view === "disabled" ? "DISABLED" : "APPROVED"}
        </span>
      </div>
      ${actions}
    </div>`;
}

window.approveStaff = async function(userId) {

  if (!isOwner()) return;

  const { error } = await db
    .from("staff")
    .update({ status: "Approved" })
    .eq("user_id", userId);

  if (error) {
    alert(error.message);
    return;
  }

  await loadStaffUsers();

};

window.disableStaff = async function(userId) {

  if (!isOwner()) return;

  if (userId === currentUser?.id) {
    alert("You cannot disable your own owner account.");
    return;
  }

  if (!confirm(
    "Disable this staff account? They will no longer be able to sign in."
  )) {
    return;
  }

  const { error } = await db
    .from("staff")
    .update({ status: "Disabled" })
    .eq("user_id", userId);

  if (error) {
    alert(error.message);
    return;
  }

  await loadStaffUsers();

};

/* =====================================================
   NAVIGATION
===================================================== */

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(section => {

      section.classList.add(
        "hidden"
      );

    });


  const target =
    $(page);


  if (target) {

    target.classList.remove(
      "hidden"
    );

  }


  document
    .querySelectorAll(
      "nav button[data-page]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });


  if (
    window.innerWidth <= 900
  ) {

    document
      .querySelector("aside")
      ?.classList
      .remove("open");

  }


  if (
    page === "availability"
  ) {

    renderAvailability();

  }

  if (page === "staff") {

    if (!isOwner()) {
      showPage("dashboard");
      return;
    }

    loadStaffUsers();

  }

}


document
  .querySelectorAll(
    "[data-page]"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        showPage(
          button.dataset.page
        );

      }
    );

  });


document
  .querySelectorAll(
    "[data-add='booking']"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        openModal();

      }
    );

  });


/* =====================================================
   MOBILE MENU
===================================================== */

$("menu")
  .addEventListener(
    "click",
    () => {

      document
        .querySelector("aside")
        .classList
        .toggle("open");

    }
  );


/* =====================================================
   START
===================================================== */

initializeBookingTimePicker();
initializeAuth();
