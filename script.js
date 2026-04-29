// ================= FIREBASE CONFIGURATION =================
// Keep this in sync with your Firebase Console configuration.
const firebaseConfig = {
    apiKey: "AIzaSyAKsr_p_4dF1E0CfDvao3dDEiaK3IUOgxs",
    authDomain: "campuslibraryiiits.firebaseapp.com",
    databaseURL: "https://campuslibraryiiits-default-rtdb.firebaseio.com",
    projectId: "campuslibraryiiits",
    storageBucket: "campuslibraryiiits.firebasestorage.app",
    messagingSenderId: "1001326639232",
    appId: "1:1001326639232:android:c4b8d2e2fb02c248a60e65"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

const booksRef = db.ref("books");
const usersRef = db.ref("user_roles");
const requestsRef = db.ref("requests");

const DAY_MS = 24 * 60 * 60 * 1000;

let currentUser = null;
let currentRole = "student";
let currentCategory = "All Categories";
let currentQuery = "";
let allBooksFromFirebase = [];
let allRequestsFromFirebase = [];
let popularityScores = {};
let selectedDetailGroupKey = null;
let detailPrimaryAction = null;
let selectedAdminRequester = null;
let selectedAdminBorrower = null;
let activeSectionId = "home-section";
let currentFormMode = "create";

window.onload = () => {
    setupEventListeners();

    setTimeout(() => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await loadUserSession(user);
            } else {
                showAuthScreen();
            }
        });
    }, 700);
};

// ================= INITIAL SESSION =================
async function loadUserSession(user) {
    try {
        const roleSnap = await usersRef.child(cleanEmail(user.email)).once("value");
        const role = roleSnap.val() || "student";

        currentUser = user;
        currentRole = role;

        setAppInterface(user, role);
        attachRealtimeListeners();
        navigateTo("home-section");
    } catch (error) {
        console.error("Session load failed:", error);
        showToast("Error loading your session. Please sign in again.", "error");
        showAuthScreen();
    }
}

function setAppInterface(user, role) {
    currentUser = user;
    currentRole = role;

    document.getElementById("loading-screen").classList.remove("active");
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("auth-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");

    document.getElementById("user-email-display").textContent = user.email;
    document.getElementById("user-role-badge").textContent = role.toUpperCase();
    document.getElementById("profile-name").textContent = role === "admin" ? "Administrator" : "Student";
    document.getElementById("profile-email").textContent = user.email;
    document.getElementById("profile-role-chip").textContent = `Role: ${role.toUpperCase()}`;

    applyRoleChrome(role);
}

function applyRoleChrome(role) {
    const isAdminRole = role === "admin";

    document.getElementById("student-sidebar").classList.toggle("hidden", isAdminRole);
    document.getElementById("student-nav").classList.toggle("hidden", isAdminRole);
    document.getElementById("admin-sidebar").classList.toggle("hidden", !isAdminRole);
    document.getElementById("admin-nav").classList.toggle("hidden", !isAdminRole);

    document.getElementById("admin-dashboard-section").classList.toggle("hidden", !isAdminRole && activeSectionId !== "admin-dashboard-section");
    document.getElementById("admin-requests-section").classList.toggle("hidden", !isAdminRole && activeSectionId !== "admin-requests-section");
}

function showAuthScreen() {
    detachRealtimeListeners();
    currentUser = null;
    currentRole = "student";

    document.getElementById("loading-screen").classList.remove("active");
    document.getElementById("loading-screen").classList.add("hidden");
    document.getElementById("auth-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
}

// ================= AUTH =================
document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.toLowerCase().trim();
    const password = document.getElementById("login-password").value;
    const role = document.querySelector('input[name="role"]:checked').value;

    if (email === "admin@iiitsurat.ac.in" && password === "@dmin@!!!t5" && role === "admin") {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            showToast("Admin login successful.", "success");
        } catch (signInError) {
            try {
                await auth.createUserWithEmailAndPassword(email, password);
                await usersRef.child(cleanEmail(email)).set("admin");
                showToast("Admin account initialized.", "success");
            } catch (createError) {
                showToast(createError.message, "error");
            }
        }
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast("Welcome back.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
});

document.getElementById("signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("reg-email").value.toLowerCase().trim();
    const password = document.getElementById("reg-password").value;
    const confirm = document.getElementById("reg-confirm").value;

    if (password !== confirm) {
        showToast("Passwords do not match.", "error");
        return;
    }

    if (!email.endsWith("@iiitsurat.ac.in")) {
        showToast("Please use your @iiitsurat.ac.in email.", "error");
        return;
    }

    try {
        await auth.createUserWithEmailAndPassword(email, password);
        await usersRef.child(cleanEmail(email)).set("student");
        await auth.signOut();
        showToast("Account created. Please sign in.", "success");
        switchAuth("login");
    } catch (error) {
        showToast(error.message, "error");
    }
});

async function logout() {
    detachRealtimeListeners();
    await auth.signOut();
    closeModal();
    window.location.reload();
}

// ================= REALTIME LISTENERS =================
function attachRealtimeListeners() {
    detachRealtimeListeners();

    booksRef.on("value", (snapshot) => {
        const books = [];
        snapshot.forEach((child) => {
            books.push(normalizeBook(child.key, child.val()));
        });
        allBooksFromFirebase = books;
        refreshAllViews();
    });

    requestsRef.on("value", (snapshot) => {
        const requests = [];
        const scores = {};
        const now = Date.now();

        snapshot.forEach((child) => {
            const request = normalizeRequest(child.key, child.val());

            if (request.status === "pending" && request.timestamp && now - request.timestamp > DAY_MS) {
                child.ref.child("status").set("rejected");
                request.status = "rejected";
            }

            const title = request.bookTitle || "";
            scores[title] = (scores[title] || 0) + 1;
            requests.push(request);
        });

        popularityScores = scores;
        allRequestsFromFirebase = requests;
        refreshAllViews();
    });

    usersRef.child(cleanEmail(currentUser.email)).on("value", (snapshot) => {
        const liveRole = snapshot.val() || "student";
        if (liveRole !== currentRole) {
            currentRole = liveRole;
            document.getElementById("user-role-badge").textContent = liveRole.toUpperCase();
            document.getElementById("profile-name").textContent = liveRole === "admin" ? "Administrator" : "Student";
            document.getElementById("profile-role-chip").textContent = `Role: ${liveRole.toUpperCase()}`;
            applyRoleChrome(liveRole);
            if (liveRole !== "admin" && (activeSectionId === "admin-dashboard-section" || activeSectionId === "admin-requests-section")) {
                navigateTo("home-section");
            } else {
                refreshAllViews();
            }
        }
    });
}

function detachRealtimeListeners() {
    booksRef.off();
    requestsRef.off();
    if (currentUser?.email) {
        usersRef.child(cleanEmail(currentUser.email)).off();
    }
}

function refreshAllViews() {
    if (!currentUser) {
        return;
    }

    renderBooks();
    renderBorrowedBooks();
    renderRequests();
    renderDashboard();
    renderAdminRequests();
    syncDetailModal();
}

// ================= NAVIGATION =================
function navigateTo(sectionId) {
    if (currentRole !== "admin" && (sectionId === "admin-dashboard-section" || sectionId === "admin-requests-section")) {
        showToast("Admin access required.", "error");
        return;
    }

    activeSectionId = sectionId;

    document.querySelectorAll(".content-section").forEach((section) => {
        section.classList.remove("active");
        section.classList.add("hidden");
    });

    const target = document.getElementById(sectionId);
    target.classList.remove("hidden");
    target.classList.add("active");

    document.querySelectorAll(".nav-item").forEach((button) => {
        button.classList.remove("active");
    });
    document.querySelectorAll(`.nav-item[data-target="${sectionId}"]`).forEach((button) => {
        button.classList.add("active");
    });

    const sectionMeta = {
        "home-section": {
            title: currentRole === "admin" ? "Smart Library" : "Smart Library",
            subtitle: "Search grouped titles, review copy availability, and open the detail view."
        },
        "borrowed-section": {
            title: "My Borrowed Books",
            subtitle: "Issued copies accepted by the admin appear here with due dates and return info."
        },
        "requests-section": {
            title: "Book Requests",
            subtitle: "Your pending book requests are shown here. Open a title to withdraw a request."
        },
        "profile-section": {
            title: "Profile",
            subtitle: "View your account details and manage your session."
        },
        "admin-dashboard-section": {
            title: "Library Dashboard",
            subtitle: "Inventory totals, grouped borrower summaries, and quick admin actions."
        },
        "admin-requests-section": {
            title: "Manage Requests",
            subtitle: "Review grouped student requests and accept or reject them from here."
        }
    };

    const meta = sectionMeta[sectionId] || sectionMeta["home-section"];
    document.getElementById("page-title").textContent = meta.title;
    document.getElementById("page-subtitle").textContent = meta.subtitle;

    if (sectionId === "admin-requests-section") {
        renderAdminRequests();
    }
}

// ================= HOME CATALOG =================
function renderBooks() {
    const container = document.getElementById("books-grid");
    const groupedBooks = getGroupedBooks();

    if (!groupedBooks.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-magnifying-glass"></i>
                <h3>No books found</h3>
                <p>Try another category or submit a different title search.</p>
            </div>
        `;
        return;
    }

    if (currentRole === "admin") {
        renderAdminGrid(groupedBooks, container);
    } else {
        renderStudentGrid(groupedBooks, container);
    }
}

function getGroupedBooks() {
    const filteredGroups = new Map();
    const normalizedQuery = currentQuery.trim().toLowerCase();

    allBooksFromFirebase.forEach((book) => {
        const title = book.title || "";
        const author = book.author || "";
        const category = book.category || "";
        const matchesQuery = !normalizedQuery || title.toLowerCase().includes(normalizedQuery);
        const matchesCategory = currentCategory === "All Categories" || currentCategory === "Popular" || category === currentCategory;

        if (!matchesQuery || !matchesCategory) {
            return;
        }

        const groupKey = `${title}|${author}`;
        if (!filteredGroups.has(groupKey)) {
            filteredGroups.set(groupKey, []);
        }
        filteredGroups.get(groupKey).push(book);
    });

    let groupedBooks = Array.from(filteredGroups.entries()).map(([groupKey, copies]) => {
        const first = copies[0];
        const availableCopies = copies.filter((copy) => Number(copy.isIssued) === 0).length;
        const bestImageSource = copies.find((copy) => (copy.imageUrl || "").trim())?.imageUrl || "";

        return {
            id: first.id,
            groupKey,
            title: first.title || "Untitled",
            author: first.author || "Unknown",
            category: first.category || "Programming",
            summary: first.summary || "No summary available for this title yet.",
            rating: Number(first.rating || 0),
            availableCopies,
            totalCopies: copies.length,
            imageUrl: bestImageSource,
            popularityCount: popularityScores[first.title] || 0
        };
    });

    if (currentCategory === "Popular") {
        groupedBooks = groupedBooks
            .sort((a, b) => {
                const popularityCompare = b.popularityCount - a.popularityCount;
                if (popularityCompare !== 0) {
                    return popularityCompare;
                }
                return b.totalCopies - a.totalCopies;
            })
            .slice(0, 10);
    }

    return groupedBooks;
}

function renderStudentGrid(books, container) {
    container.innerHTML = books.map((book) => {
        const encodedGroupKey = encodeURIComponent(book.groupKey);
        const studentState = getStudentGroupState(book.title);
        const copiesClass = currentCategory === "Popular"
            ? "book-copy-pill popular"
            : book.availableCopies > 0
                ? "book-copy-pill available"
                : "book-copy-pill unavailable";
        const copiesLabel = currentCategory === "Popular"
            ? `Trending: ${book.availableCopies}/${book.totalCopies} available`
            : `Available: ${book.availableCopies}/${book.totalCopies}`;
        const titlePrefix = currentCategory === "Popular" ? "Trending: " : "";

        return `
            <article class="book-card" onclick="showBookDetailByKey('${encodedGroupKey}')">
                <div class="book-row">
                    ${renderBookArtwork(book, false)}
                    <div class="book-main">
                        <div class="book-topline">
                            <h3>${escapeHtml(`${titlePrefix}${book.title}`)}</h3>
                            <span class="${copiesClass}">${escapeHtml(copiesLabel)}</span>
                        </div>
                        <p class="book-author">${escapeHtml(book.author)}</p>
                        <div class="book-meta-row">
                            <span class="category-pill">${escapeHtml(book.category)}</span>
                            ${studentState.label ? `<span class="mini-chip">${escapeHtml(studentState.label)}</span>` : ""}
                        </div>
                        <p class="book-summary">${escapeHtml(book.summary)}</p>
                        <div class="book-footer">
                            <span class="panel-subtle">Tap the card to request, withdraw, or inspect the title.</span>
                            <div class="card-actions">
                                <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); showBookDetailByKey('${encodedGroupKey}')">
                                    <i class="fas fa-arrow-right"></i> View Detail
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function renderAdminGrid(books, container) {
    container.innerHTML = books.map((book) => {
        const encodedGroupKey = encodeURIComponent(book.groupKey);
        const copiesClass = currentCategory === "Popular"
            ? "book-copy-pill popular"
            : book.availableCopies > 0
                ? "book-copy-pill available"
                : "book-copy-pill unavailable";
        const copiesLabel = currentCategory === "Popular"
            ? `Trending: ${book.availableCopies}/${book.totalCopies} available`
            : `Available: ${book.availableCopies}/${book.totalCopies}`;

        return `
            <article class="book-card" onclick="showBookDetailByKey('${encodedGroupKey}')">
                <div class="book-row">
                    ${renderBookArtwork(book, false)}
                    <div class="book-main">
                        <div class="book-topline">
                            <h3>${escapeHtml(book.title)}</h3>
                            <span class="${copiesClass}">${escapeHtml(copiesLabel)}</span>
                        </div>
                        <p class="book-author">${escapeHtml(book.author)}</p>
                        <div class="book-meta-row">
                            <span class="category-pill">${escapeHtml(book.category)}</span>
                            <span class="mini-chip">Inventory view</span>
                        </div>
                        <p class="book-summary">${escapeHtml(book.summary)}</p>
                        <div class="book-footer">
                            <span class="panel-subtle">Open the detail panel to add copies, remove copies, or return an issued instance.</span>
                            <div class="card-actions">
                                <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); editBook('${book.id}')">
                                    <i class="fas fa-pen"></i> Edit
                                </button>
                                <button class="btn-primary btn-sm" onclick="event.stopPropagation(); showBookDetailByKey('${encodedGroupKey}')">
                                    <i class="fas fa-layer-group"></i> Inventory
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function renderBookArtwork(book, large) {
    const shellClass = large ? "detail-cover-shell" : "book-cover-shell";
    const imageUrl = (book.imageUrl || "").trim();
    const fallbackTitle = escapeHtml(book.title || "Book");
    const safeSrc = escapeAttribute(imageUrl);
    const sizeClass = imageUrl ? "" : " is-fallback";

    return `
        <div class="${shellClass}${sizeClass}">
            <img src="${safeSrc}" alt="${fallbackTitle}" onerror="this.style.display='none'; this.parentElement.classList.add('is-fallback')" ${imageUrl ? "" : 'style="display:none"'} />
            <div class="book-cover-fallback"><i class="fas fa-book-open"></i></div>
        </div>
    `;
}

function getStudentGroupState(title) {
    const borrowedCopy = allBooksFromFirebase.find((book) =>
        book.title === title &&
        Number(book.isIssued) === 1 &&
        equalsEmail(book.borrowedBy, currentUser?.email)
    );

    if (borrowedCopy) {
        return { label: "Issued to you" };
    }

    const pending = allRequestsFromFirebase.find((request) =>
        request.bookTitle === title &&
        equalsEmail(request.studentEmail, currentUser?.email) &&
        request.status === "pending"
    );

    if (pending) {
        return { label: "Pending request" };
    }

    return { label: "" };
}

// ================= SEARCH + SUGGESTIONS =================
function updateSuggestions(text) {
    const list = [];
    const seenTitles = new Set();
    const normalized = text.trim().toLowerCase();

    if (!normalized) {
        hideSuggestions();
        return;
    }

    for (const book of allBooksFromFirebase) {
        if (seenTitles.has(book.title)) {
            continue;
        }

        const title = (book.title || "").toLowerCase();
        const author = (book.author || "").toLowerCase();

        if (title.startsWith(normalized) || author.startsWith(normalized)) {
            list.push(book);
            seenTitles.add(book.title);
        }

        if (list.length >= 7) {
            break;
        }
    }

    const container = document.getElementById("catalog-suggestions");
    if (!list.length) {
        hideSuggestions();
        return;
    }

    container.innerHTML = list.map((book) => {
        const key = encodeURIComponent(`${book.title}|${book.author}`);
        return `
            <button class="suggestion-item" onclick="openSuggestion('${key}', '${escapeJs(book.title)}')">
                <span class="borrower-avatar"><i class="fas fa-book-open"></i></span>
                <span class="suggestion-copy">
                    <strong>${escapeHtml(book.title)}</strong>
                    <span>${escapeHtml(book.author)}</span>
                </span>
            </button>
        `;
    }).join("");
    container.classList.remove("hidden");
}

function hideSuggestions() {
    const container = document.getElementById("catalog-suggestions");
    container.classList.add("hidden");
    container.innerHTML = "";
}

function openSuggestion(encodedGroupKey, title) {
    document.getElementById("book-search").value = title;
    currentQuery = title;
    document.querySelector(".clear-search").classList.remove("hidden");
    hideSuggestions();
    renderBooks();
    showBookDetailByKey(encodedGroupKey);
}

function submitCatalogSearch() {
    const value = document.getElementById("book-search").value.trim();
    currentQuery = value;
    renderBooks();
    hideSuggestions();
}

function clearSearch() {
    document.getElementById("book-search").value = "";
    currentQuery = "";
    hideSuggestions();
    renderBooks();
    document.querySelector(".clear-search").classList.add("hidden");
}

// ================= DETAIL MODAL =================
function showBookDetailByKey(encodedGroupKey) {
    selectedDetailGroupKey = decodeURIComponent(encodedGroupKey);
    renderBookDetailModal();
    openModal("book-detail-modal");
}

function syncDetailModal() {
    if (!selectedDetailGroupKey) {
        return;
    }

    const detailModal = document.getElementById("book-detail-modal");
    if (!detailModal.classList.contains("hidden")) {
        renderBookDetailModal();
    }
}

function renderBookDetailModal() {
    const detailState = getDetailState();
    if (!detailState) {
        closeModal();
        return;
    }

    const { displayBook, copies, availableCopies, pendingRequest, borrowedByUser } = detailState;
    const coverShell = document.getElementById("detail-cover-shell");
    const coverImage = document.getElementById("detail-cover-image");
    const imageUrl = (displayBook.imageUrl || "").trim();

    document.getElementById("detail-title").textContent = displayBook.title;
    document.getElementById("detail-author").textContent = `By ${displayBook.author}`;
    document.getElementById("detail-category").textContent = displayBook.category;
    document.getElementById("detail-copies").textContent = `Available: ${availableCopies}/${copies.length}`;
    document.getElementById("detail-summary").textContent = displayBook.summary || "No summary available for this title yet.";

    if (imageUrl) {
        coverImage.onerror = () => {
            coverImage.style.display = "none";
            coverShell.classList.add("is-fallback");
        };
        coverImage.src = imageUrl;
        coverImage.style.display = "block";
        coverShell.classList.remove("is-fallback");
    } else {
        coverImage.removeAttribute("src");
        coverImage.style.display = "none";
        coverShell.classList.add("is-fallback");
    }

    const detailStatus = document.getElementById("detail-status");
    const detailAdminPanel = document.getElementById("detail-admin-panel");
    const detailEditBtn = document.getElementById("detail-edit-btn");
    const detailDeleteBtn = document.getElementById("detail-delete-btn");
    const detailActionBtn = document.getElementById("detail-action-btn");

    detailStatus.classList.add("hidden");
    detailAdminPanel.classList.add("hidden");
    detailEditBtn.classList.add("hidden");
    detailDeleteBtn.classList.add("hidden");
    detailActionBtn.classList.add("hidden");
    detailActionBtn.disabled = false;
    detailPrimaryAction = null;

    if (currentRole === "admin") {
        detailAdminPanel.classList.remove("hidden");
        detailEditBtn.classList.remove("hidden");
        detailDeleteBtn.classList.remove("hidden");

        document.getElementById("detail-admin-copy-text").textContent = `Total Inventory: ${copies.length} (Available: ${availableCopies})`;
        document.getElementById("detail-admin-status").textContent = `Admin View: This instance is ${Number(displayBook.isIssued) === 1 ? `Issued to ${displayBook.borrowedBy}` : "Available"}`;

        detailStatus.classList.remove("hidden");
        detailStatus.textContent = `Admin View: This instance is ${Number(displayBook.isIssued) === 1 ? `Issued to ${displayBook.borrowedBy}` : "Available"}.`;

        if (Number(displayBook.isIssued) === 1) {
            detailPrimaryAction = "return";
            detailActionBtn.textContent = "Return Book";
            detailActionBtn.classList.remove("hidden");
        }
        return;
    }

    if (pendingRequest) {
        detailPrimaryAction = "withdraw";
        detailActionBtn.textContent = "Withdraw Request";
        detailActionBtn.classList.remove("hidden");
        return;
    }

    if (borrowedByUser) {
        detailStatus.classList.remove("hidden");
        detailStatus.textContent = "You have borrowed this book. Please return it to the library physically before or on the due date.";
        return;
    }

    detailPrimaryAction = "request";
    detailActionBtn.textContent = "Request for Book";
    detailActionBtn.disabled = availableCopies <= 0;
    detailActionBtn.classList.remove("hidden");
}

function getDetailState() {
    if (!selectedDetailGroupKey) {
        return null;
    }

    const copies = allBooksFromFirebase.filter((book) => `${book.title}|${book.author}` === selectedDetailGroupKey);
    if (!copies.length) {
        return null;
    }

    const availableCopy = copies.find((copy) => Number(copy.isIssued) === 0);
    const borrowedByUser = copies.find((copy) => Number(copy.isIssued) === 1 && equalsEmail(copy.borrowedBy, currentUser?.email));
    const firstCopy = copies[0];
    const displayBook = availableCopy || borrowedByUser || firstCopy;
    const bestImageUrl = copies.find((copy) => (copy.imageUrl || "").trim())?.imageUrl || "";
    const pendingRequest = allRequestsFromFirebase.find((request) =>
        request.bookTitle === displayBook.title &&
        equalsEmail(request.studentEmail, currentUser?.email) &&
        request.status === "pending"
    );

    return {
        copies,
        displayBook: {
            ...displayBook,
            imageUrl: bestImageUrl || displayBook.imageUrl || ""
        },
        availableCopies: copies.filter((copy) => Number(copy.isIssued) === 0).length,
        pendingRequest,
        borrowedByUser
    };
}

async function handleDetailPrimaryAction() {
    const detailState = getDetailState();
    if (!detailState) {
        return;
    }

    if (detailPrimaryAction === "request") {
        await sendBorrowRequest(detailState);
    } else if (detailPrimaryAction === "withdraw") {
        await withdrawRequest(detailState);
    } else if (detailPrimaryAction === "return") {
        await returnIssuedCopy(detailState.displayBook.id);
    }
}

async function sendBorrowRequest(detailState) {
    if (!isStudent()) {
        return;
    }

    const combinedCount =
        allBooksFromFirebase.filter((book) =>
            Number(book.isIssued) === 1 && equalsEmail(book.borrowedBy, currentUser.email)
        ).length +
        allRequestsFromFirebase.filter((request) =>
            equalsEmail(request.studentEmail, currentUser.email) && request.status === "pending"
        ).length;

    if (combinedCount >= 2) {
        showToast("You can have a maximum of 2 books, including pending requests.", "warning");
        return;
    }

    const requestId = requestsRef.push().key;
    const now = new Date();

    if (!requestId) {
        showToast("Could not create the request. Please try again.", "error");
        return;
    }

    const requestPayload = {
        requestId,
        bookId: detailState.displayBook.id,
        bookTitle: detailState.displayBook.title,
        studentEmail: currentUser.email,
        requestDate: formatDateTime(now),
        timestamp: now.getTime(),
        status: "pending"
    };

    try {
        await requestsRef.child(requestId).set(requestPayload);
        showToast(`Request sent at ${requestPayload.requestDate}.`, "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function withdrawRequest(detailState) {
    if (!detailState.pendingRequest) {
        return;
    }

    try {
        await requestsRef.child(detailState.pendingRequest.requestId).remove();
        showToast("Request withdrawn.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function returnIssuedCopy(bookId) {
    if (!isAdmin()) {
        return;
    }

    const updates = {
        isIssued: 0,
        borrowedBy: "",
        dueDate: "",
        borrowDate: "",
        requestStatus: "",
        requestedBy: ""
    };

    try {
        await booksRef.child(bookId).update(updates);
        showToast("Book returned.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function addCopyToSelectedBook() {
    if (!isAdmin()) {
        return;
    }

    const detailState = getDetailState();
    if (!detailState) {
        return;
    }

    const template = detailState.displayBook;
    const newId = booksRef.push().key;

    if (!newId) {
        showToast("Could not create a new copy.", "error");
        return;
    }

    const newCopy = {
        id: newId,
        title: template.title,
        author: template.author,
        category: template.category,
        summary: template.summary,
        rating: Number(template.rating || 0),
        isIssued: 0,
        dueDate: "",
        borrowedBy: "",
        borrowDate: "",
        availableCopies: 1,
        totalCopies: 1,
        requestStatus: "",
        requestedBy: "",
        imageUrl: template.imageUrl || ""
    };

    try {
        await booksRef.child(newId).set(newCopy);
        showToast("New copy added.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function removeSelectedCopy() {
    if (!isAdmin()) {
        return;
    }

    const detailState = getDetailState();
    if (!detailState) {
        return;
    }

    if (detailState.copies.length <= 1) {
        showToast("Cannot remove the last copy.", "warning");
        return;
    }

    const removableCopy = detailState.copies.find((copy) => Number(copy.isIssued) === 0);
    if (!removableCopy) {
        showToast("No available copy can be removed right now.", "warning");
        return;
    }

    try {
        await booksRef.child(removableCopy.id).remove();
        showToast("Available copy removed.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

function editSelectedBook() {
    const detailState = getDetailState();
    if (!detailState) {
        return;
    }

    editBook(detailState.displayBook.id);
}

function deleteSelectedBook() {
    const detailState = getDetailState();
    if (!detailState) {
        return;
    }

    showDeleteConfirmation(detailState.displayBook.id, "Delete this book copy?");
}

// ================= ADD / EDIT BOOK =================
function showAddBookModal() {
    if (!isAdmin()) {
        return;
    }

    currentFormMode = "create";
    document.getElementById("book-form-title").textContent = "Add New Book";
    document.getElementById("book-save-btn").textContent = "Save Book";
    document.getElementById("book-delete-btn").classList.add("hidden");
    document.getElementById("book-form").reset();
    document.getElementById("book-id").value = "";
    document.getElementById("book-title").disabled = false;
    document.getElementById("book-author").disabled = false;

    openModal("book-modal");
}

async function editBook(bookId) {
    if (!isAdmin()) {
        return;
    }

    const book = allBooksFromFirebase.find((entry) => entry.id === bookId);
    if (!book) {
        showToast("Book not found.", "error");
        return;
    }

    currentFormMode = "edit";
    document.getElementById("book-form-title").textContent = "Edit Book Details";
    document.getElementById("book-save-btn").textContent = "Update Book";
    document.getElementById("book-delete-btn").classList.remove("hidden");

    document.getElementById("book-id").value = book.id;
    document.getElementById("book-title").value = book.title;
    document.getElementById("book-author").value = book.author;
    document.getElementById("book-category").value = book.category || "Programming";
    document.getElementById("book-image").value = book.imageUrl || "";
    document.getElementById("book-desc").value = book.summary || "";
    document.getElementById("book-title").disabled = true;
    document.getElementById("book-author").disabled = true;

    openModal("book-modal");
}

document.getElementById("book-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isAdmin()) {
        return;
    }

    const title = document.getElementById("book-title").value.trim();
    const author = document.getElementById("book-author").value.trim();
    const category = document.getElementById("book-category").value;
    const imageUrl = document.getElementById("book-image").value.trim();
    const summary = document.getElementById("book-desc").value.trim();
    const existingId = document.getElementById("book-id").value;

    if (!title || !author) {
        showToast("Title and author are required.", "error");
        return;
    }

    try {
        if (currentFormMode === "edit" && existingId) {
            const currentBook = allBooksFromFirebase.find((book) => book.id === existingId);
            if (!currentBook) {
                showToast("Book copy not found.", "error");
                return;
            }

            const updatedBook = {
                ...currentBook,
                summary,
                category,
                imageUrl
            };

            await booksRef.child(existingId).set(updatedBook);
            showToast("Book updated.", "success");
        } else {
            const newId = booksRef.push().key;
            if (!newId) {
                throw new Error("Could not generate a Firebase key.");
            }

            const newBook = {
                id: newId,
                title,
                author,
                category,
                summary,
                rating: 0,
                isIssued: 0,
                dueDate: "",
                borrowedBy: "",
                borrowDate: "",
                availableCopies: 1,
                totalCopies: 1,
                requestStatus: "",
                requestedBy: "",
                imageUrl
            };

            await booksRef.child(newId).set(newBook);
            showToast("Book saved.", "success");
        }

        closeModal();
    } catch (error) {
        showToast(error.message, "error");
    }
});

function deleteBookFromForm() {
    const bookId = document.getElementById("book-id").value;
    if (!bookId) {
        return;
    }

    showDeleteConfirmation(bookId, "Delete this book copy?");
}

function showDeleteConfirmation(bookId, title) {
    showConfirmModal(title, "This copy will be removed permanently.", async () => {
        try {
            await booksRef.child(bookId).remove();
            showToast("Book copy deleted.", "success");
            closeModal();
        } catch (error) {
            showToast(error.message, "error");
        }
    });
}

// ================= BORROWED =================
function renderBorrowedBooks() {
    const container = document.getElementById("borrowed-list");
    const emptyState = document.getElementById("empty-borrowed");

    const borrowed = allBooksFromFirebase.filter((book) =>
        Number(book.isIssued) === 1 && equalsEmail(book.borrowedBy, currentUser?.email)
    );

    document.getElementById("borrowed-count").textContent = `${borrowed.length} ${borrowed.length === 1 ? "book" : "books"}`;

    if (!borrowed.length) {
        container.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    container.innerHTML = borrowed.map((book) => `
        <article class="request-card borrowed-card">
            <div class="request-topline">
                <h3>${escapeHtml(book.title)}</h3>
                <span class="support-chip">${escapeHtml(`Due: ${book.dueDate || "N/A"}`)}</span>
            </div>
            <div class="request-details">
                <p><strong>Author:</strong> ${escapeHtml(book.author)}</p>
                <p><strong>Borrowed:</strong> ${escapeHtml(book.borrowDate || "N/A")}</p>
                <p><strong>Return Flow:</strong> Physical return is handled by the library admin.</p>
            </div>
        </article>
    `).join("");
}

// ================= REQUESTS =================
function renderRequests() {
    const container = document.getElementById("requests-list");
    const emptyState = document.getElementById("empty-requests");

    const myPendingRequests = allRequestsFromFirebase.filter((request) =>
        equalsEmail(request.studentEmail, currentUser?.email) && request.status === "pending"
    );

    document.getElementById("pending-count").textContent = `${myPendingRequests.length} pending`;

    if (!myPendingRequests.length) {
        container.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    container.innerHTML = myPendingRequests.map((request) => `
        <article class="request-card">
            <div class="request-topline">
                <h3>${escapeHtml(request.bookTitle)}</h3>
                <span class="request-status pending">PENDING</span>
            </div>
            <div class="request-details">
                <p><strong>Requested on:</strong> ${escapeHtml(request.requestDate || "N/A")}</p>
                <p><strong>Flow:</strong> Open the title detail to withdraw this request.</p>
            </div>
        </article>
    `).join("");
}

function renderAdminRequests() {
    if (currentRole !== "admin") {
        return;
    }

    const pendingRequests = allRequestsFromFirebase.filter((request) => request.status === "pending");
    document.getElementById("admin-pending-chip").textContent = `${pendingRequests.length} pending requests`;

    const searchValue = document.getElementById("admin-request-search").value.trim().toLowerCase();
    const grouped = new Map();

    pendingRequests.forEach((request) => {
        const email = request.studentEmail || "";
        if (searchValue && !email.toLowerCase().includes(searchValue)) {
            return;
        }

        if (!grouped.has(email)) {
            grouped.set(email, []);
        }
        grouped.get(email).push(request);
    });

    const requesterGroups = Array.from(grouped.entries()).map(([email, requests]) => ({
        email,
        count: requests.length
    })).sort((a, b) => a.email.localeCompare(b.email));

    document.getElementById("admin-requests-count").textContent = `${requesterGroups.length} ${requesterGroups.length === 1 ? "student" : "students"}`;

    if (selectedAdminRequester && !requesterGroups.some((entry) => entry.email === selectedAdminRequester)) {
        selectedAdminRequester = null;
    }
    if (!selectedAdminRequester && requesterGroups.length) {
        selectedAdminRequester = requesterGroups[0].email;
    }

    renderAdminRequesterGroups(requesterGroups);
    renderAdminRequestDetailList(grouped);
}

function renderAdminRequesterGroups(groups) {
    const container = document.getElementById("admin-requesters-list");
    const emptyState = document.getElementById("empty-admin-requesters");

    if (!groups.length) {
        container.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    container.innerHTML = groups.map((group) => `
        <button class="borrower-card ${selectedAdminRequester === group.email ? "active" : ""}" onclick="selectAdminRequester('${escapeJs(group.email)}')">
            <span class="borrower-avatar"><i class="fas fa-user-clock"></i></span>
            <span class="borrower-copy">
                <strong>${escapeHtml(group.email)}</strong>
                <p>${group.count} ${group.count === 1 ? "book requested" : "books requested"}</p>
            </span>
            <span class="borrower-arrow"><i class="fas fa-chevron-right"></i></span>
        </button>
    `).join("");
}

function renderAdminRequestDetailList(groupedRequests) {
    const container = document.getElementById("admin-requests-list");
    const emptyState = document.getElementById("empty-admin-requests");
    const title = document.getElementById("admin-request-detail-title");
    const countChip = document.getElementById("admin-selected-request-count");

    if (!selectedAdminRequester || !groupedRequests.has(selectedAdminRequester)) {
        container.innerHTML = "";
        title.textContent = "Pending Requests";
        countChip.textContent = "Select a student";
        emptyState.classList.remove("hidden");
        return;
    }

    const requests = groupedRequests.get(selectedAdminRequester);
    title.textContent = selectedAdminRequester;
    countChip.textContent = `${requests.length} pending`;
    emptyState.classList.add("hidden");

    container.innerHTML = requests.map((request) => `
        <article class="request-card">
            <div class="request-topline">
                <h3>${escapeHtml(request.bookTitle)}</h3>
                <span class="request-status pending">PENDING</span>
            </div>
            <div class="request-details">
                <p><strong>Student:</strong> ${escapeHtml(request.studentEmail)}</p>
                <p><strong>Requested on:</strong> ${escapeHtml(request.requestDate || "N/A")}</p>
            </div>
            <div class="request-actions">
                <button class="btn-secondary btn-sm" onclick="acceptRequest('${request.requestId}')">Accept</button>
                <button class="btn-danger-outline btn-sm" onclick="rejectRequest('${request.requestId}')">Reject</button>
            </div>
        </article>
    `).join("");
}

function selectAdminRequester(email) {
    selectedAdminRequester = email;
    renderAdminRequests();
}

async function acceptRequest(requestId) {
    if (!isAdmin()) {
        return;
    }

    const request = allRequestsFromFirebase.find((entry) => entry.requestId === requestId);
    if (!request) {
        showToast("Request not found.", "error");
        return;
    }

    const targetCopy = allBooksFromFirebase.find((book) => book.title === request.bookTitle && Number(book.isIssued) === 0);
    if (!targetCopy) {
        showToast("No available copy found.", "warning");
        return;
    }

    const updates = {
        isIssued: 1,
        borrowedBy: request.studentEmail,
        dueDate: formatDateOnly(new Date(Date.now() + 7 * DAY_MS)),
        borrowDate: formatDateOnly(new Date())
    };

    try {
        await booksRef.child(targetCopy.id).update(updates);
        await requestsRef.child(request.requestId).child("status").set("accepted");
        showToast("Book issued.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function rejectRequest(requestId) {
    if (!isAdmin()) {
        return;
    }

    try {
        await requestsRef.child(requestId).child("status").set("rejected");
        showToast("Request rejected.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

// ================= DASHBOARD =================
function renderDashboard() {
    if (currentRole !== "admin") {
        return;
    }

    const totalCount = allBooksFromFirebase.length;
    const borrowedCount = allBooksFromFirebase.filter((book) => Number(book.isIssued) === 1).length;
    const availableCount = totalCount - borrowedCount;

    document.getElementById("dash-total").textContent = totalCount;
    document.getElementById("dash-available").textContent = availableCount;
    document.getElementById("dash-borrowed").textContent = borrowedCount;

    const borrowerMap = new Map();
    allBooksFromFirebase.forEach((book) => {
        if (Number(book.isIssued) === 1 && book.borrowedBy) {
            borrowerMap.set(book.borrowedBy, (borrowerMap.get(book.borrowedBy) || 0) + 1);
        }
    });

    const searchValue = document.getElementById("admin-borrower-search").value.trim().toLowerCase();
    const borrowers = Array.from(borrowerMap.entries())
        .map(([email, count]) => ({ email, count }))
        .filter((borrower) => !searchValue || borrower.email.toLowerCase().includes(searchValue))
        .sort((a, b) => a.email.localeCompare(b.email));
    const container = document.getElementById("admin-borrowers-list");
    const emptyState = document.getElementById("empty-admin-borrowers");

    if (!borrowers.length) {
        container.innerHTML = "";
        emptyState.classList.remove("hidden");
        selectedAdminBorrower = null;
        renderAdminBorrowedBooksDetail([]);
        return;
    }

    emptyState.classList.add("hidden");
    if (selectedAdminBorrower && !borrowers.some((borrower) => borrower.email === selectedAdminBorrower)) {
        selectedAdminBorrower = null;
    }
    if (!selectedAdminBorrower) {
        selectedAdminBorrower = borrowers[0].email;
    }

    container.innerHTML = borrowers.map((borrower) => `
        <button type="button" class="borrower-card ${selectedAdminBorrower === borrower.email ? "active" : ""}" onclick="selectAdminBorrower('${escapeJs(borrower.email)}')">
            <span class="borrower-avatar"><i class="fas fa-user-graduate"></i></span>
            <span class="borrower-copy">
                <strong>${escapeHtml(borrower.email)}</strong>
                <p>${borrower.count} ${borrower.count === 1 ? "book borrowed" : "books borrowed"}</p>
            </span>
            <span class="borrower-arrow"><i class="fas fa-book-open"></i></span>
        </button>
    `).join("");

    renderAdminBorrowedBooksDetail(
        allBooksFromFirebase.filter((book) =>
            Number(book.isIssued) === 1 && equalsEmail(book.borrowedBy, selectedAdminBorrower)
        )
    );
}

function selectAdminBorrower(email) {
    selectedAdminBorrower = email;
    renderDashboard();
}

function renderAdminBorrowedBooksDetail(books) {
    const title = document.getElementById("admin-borrower-detail-title");
    const countChip = document.getElementById("admin-selected-borrower-count");
    const list = document.getElementById("admin-borrowed-books-list");
    const emptyState = document.getElementById("empty-admin-borrowed-books");

    if (!selectedAdminBorrower || !books.length) {
        title.textContent = "Borrowed Books";
        countChip.textContent = "Select a student";
        list.innerHTML = "";
        emptyState.classList.remove("hidden");
        return;
    }

    title.textContent = selectedAdminBorrower;
    countChip.textContent = `${books.length} ${books.length === 1 ? "book" : "books"}`;
    emptyState.classList.add("hidden");

    list.innerHTML = books.map((book) => `
        <article class="request-card issued-book-card">
            <div class="issued-book-header">
                <h3>${escapeHtml(book.title)}</h3>
                <span class="support-chip">${escapeHtml(`Due: ${book.dueDate || "N/A"}`)}</span>
            </div>
            <div class="issued-book-meta">
                <p><strong>Borrowed by:</strong> ${escapeHtml(book.borrowedBy || "N/A")}</p>
                <p><strong>Author:</strong> ${escapeHtml(book.author || "Unknown")}</p>
                <p><strong>Date:</strong> ${escapeHtml(book.borrowDate || "N/A")}</p>
            </div>
            <div class="issued-book-actions">
                <button type="button" class="btn-secondary btn-sm" onclick="returnBorrowedBookFromAdmin('${book.id}')">
                    <i class="fas fa-reply"></i> Return Book
                </button>
            </div>
        </article>
    `).join("");
}

async function returnBorrowedBookFromAdmin(bookId) {
    await returnIssuedCopy(bookId);
}

// ================= MODALS =================
function openModal(modalId) {
    const backdrop = document.getElementById("modal-backdrop");
    backdrop.classList.remove("hidden");
    document.body.classList.add("modal-open");

    document.querySelectorAll(".modal").forEach((modal) => {
        modal.classList.add("hidden");
    });

    document.getElementById(modalId).classList.remove("hidden");
}

function closeModal() {
    document.getElementById("modal-backdrop").classList.add("hidden");
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".modal").forEach((modal) => {
        modal.classList.add("hidden");
    });
    document.getElementById("confirm-btn").onclick = null;
}

function showConfirmModal(title, message, onConfirm) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    document.getElementById("confirm-btn").onclick = async () => {
        await onConfirm();
    };

    openModal("confirm-modal");
}

// ================= UTILITIES =================
function isAdmin() {
    if (currentRole !== "admin") {
        showToast("Admin privileges required.", "error");
        return false;
    }
    return true;
}

function isStudent() {
    if (currentRole !== "student") {
        showToast("Only students can do this.", "error");
        return false;
    }
    return true;
}

function normalizeBook(id, value = {}) {
    return {
        id: value.id || id,
        title: value.title || "Untitled",
        author: value.author || "Unknown",
        category: value.category || "Programming",
        summary: value.summary || value.description || "",
        rating: Number(value.rating || 0),
        isIssued: Number(value.isIssued || 0),
        dueDate: value.dueDate || "",
        borrowedBy: value.borrowedBy || "",
        borrowDate: value.borrowDate || "",
        availableCopies: Number(value.availableCopies || 0),
        totalCopies: Number(value.totalCopies || 0),
        requestStatus: value.requestStatus || "",
        requestedBy: value.requestedBy || "",
        imageUrl: value.imageUrl || ""
    };
}

function normalizeRequest(id, value = {}) {
    return {
        requestId: value.requestId || id,
        bookId: value.bookId || "",
        bookTitle: value.bookTitle || "Untitled",
        studentEmail: value.studentEmail || "",
        requestDate: value.requestDate || "",
        timestamp: Number(value.timestamp || 0),
        status: (value.status || "pending").toLowerCase()
    };
}

function cleanEmail(email) {
    return (email || "").replace(/\./g, ",");
}

function equalsEmail(a, b) {
    return (a || "").toLowerCase() === (b || "").toLowerCase();
}

function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value || "");
}

function escapeJs(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function showToast(message, type = "info") {
    const icons = {
        success: "check",
        error: "xmark",
        warning: "triangle-exclamation",
        info: "circle-info"
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    document.getElementById("toast-container").appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3200);
}

function switchAuth(view) {
    document.getElementById("login-section").classList.toggle("hidden", view === "signup");
    document.getElementById("signup-section").classList.toggle("hidden", view !== "signup");
}

function togglePass(type) {
    const input = document.getElementById(`${type}-password`);
    input.type = input.type === "password" ? "text" : "password";
}

function checkPassStrength() {
    const pass = document.getElementById("reg-password").value;
    const bar = document.getElementById("pass-bar");

    let strength = 0;
    if (pass.length >= 6) strength += 1;
    if (pass.length >= 8) strength += 1;
    if (/[A-Z]/.test(pass)) strength += 1;
    if (/[0-9]/.test(pass)) strength += 1;

    const colors = ["#e06b86", "#d9872d", "#7da65d", "#8b5cf6"];
    bar.style.width = `${(strength / 4) * 100}%`;
    bar.style.background = colors[Math.max(0, Math.min(strength - 1, colors.length - 1))] || colors[0];
}

// ================= DOM EVENTS =================
function setupEventListeners() {
    const bookSearch = document.getElementById("book-search");
    const categoryFilter = document.getElementById("category-filter");
    const adminRequestSearch = document.getElementById("admin-request-search");
    const adminBorrowerSearch = document.getElementById("admin-borrower-search");
    const backdrop = document.getElementById("modal-backdrop");

    bookSearch.addEventListener("input", (event) => {
        const value = event.target.value.trim();
        document.querySelector(".clear-search").classList.toggle("hidden", !value);

        if (!value) {
            currentQuery = "";
            renderBooks();
            hideSuggestions();
            return;
        }

        updateSuggestions(value);
    });

    bookSearch.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitCatalogSearch();
        }
    });

    categoryFilter.addEventListener("change", (event) => {
        currentCategory = event.target.value;
        renderBooks();
    });

    adminRequestSearch.addEventListener("input", () => {
        renderAdminRequests();
    });

    adminBorrowerSearch.addEventListener("input", () => {
        renderDashboard();
    });

    backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
            closeModal();
        }
    });

    window.addEventListener("click", (event) => {
        const suggestions = document.getElementById("catalog-suggestions");
        const searchPanel = document.querySelector(".catalog-search-panel");
        if (!suggestions.contains(event.target) && !searchPanel.contains(event.target)) {
            hideSuggestions();
        }
    });

    window.addEventListener("online", () => {
        document.getElementById("connection-status").classList.add("hidden");
    });

    window.addEventListener("offline", () => {
        document.getElementById("connection-status").classList.remove("hidden");
    });
}

// ================= AI SUMMARY (Ported from Android SummaryAI.java) =================
const SummaryAI = (() => {
    const adjectives = [
        "comprehensive", "groundbreaking", "accessible", "in-depth",
        "practical", "theoretical", "essential", "thought-provoking"
    ];

    const hooks = [
        "Dive into the fundamentals of", "Explore the intricate world of",
        "A scholarly deep-dive into", "Unlock the core concepts of",
        "Master the principles of", "An authoritative guide on",
        "Broaden your understanding of", "Navigate the complexities of"
    ];

    const connectors = [
        "is masterfully presented by", "is a landmark work authored by",
        "serves as a primary reference from", "delivers practical insights by",
        "is brilliantly broken down by", "is meticulously detailed by",
        "comes highly recommended, written by", "is explored with clarity by"
    ];

    const conclusions = [
        "making it a cornerstone for students.",
        "an absolute must-read for serious learners.",
        "bridging the gap between theory and real-world application.",
        "providing a solid foundation for advanced studies.",
        "offering an unmatched perspective on the subject."
    ];

    function getValueStatement(category) {
        const pools = {
            electronics: ["logic gates and microprocessors", "embedded systems architecture", "advanced circuit analysis", "signal processing and hardware integration", "semiconductor physics"],
            programming: ["data structures and algorithms", "efficient memory management", "object-oriented design patterns", "asynchronous logic and multithreading", "clean code principles"],
            mathematics: ["probabilistic modeling", "discrete mathematical structures", "linear transformations and matrices", "differential calculus applications", "graph theory and combinatorics"]
        };
        const general = ["applied research methodologies", "critical thinking and analysis", "foundational academic principles", "interdisciplinary problem solving"];

        const pool = pools[(category || "").toLowerCase()] || general;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function generateInstantSummary(title, author, category) {
        if (!title || !title.trim() || !author || !author.trim()) {
            return "A fascinating read waiting to be explored.";
        }

        const adj = pick(adjectives);
        const hook = pick(hooks);
        const connector = pick(connectors);
        const value = getValueStatement(category);
        const conclusion = pick(conclusions);

        const structureChoice = Math.floor(Math.random() * 3);
        let summary = "";

        if (structureChoice === 0) {
            // Structure A: Hook first
            summary = `${hook} ${title}. This ${adj} text ${connector} ${author}. It provides essential exposure to ${value}, ${conclusion}`;
        } else if (structureChoice === 1) {
            // Structure B: Author first
            summary = `Written by ${author}, ${title} is a ${adj} resource. It invites readers to ${hook.toLowerCase()} the subject matter. Expect heavy emphasis on ${value}, ${conclusion}`;
        } else {
            // Structure C: Value first
            const capitalConclusion = conclusion.charAt(0).toUpperCase() + conclusion.substring(1);
            summary = `If you need to master ${value}, ${title} is an ${adj} choice. The subject ${connector} ${author}. ${capitalConclusion}`;
        }

        return summary;
    }

    return { generateInstantSummary };
})();

function handleAISummary() {
    if (!isAdmin()) return;

    const title = document.getElementById("book-title").value.trim();
    const author = document.getElementById("book-author").value.trim();
    const category = document.getElementById("book-category").value;

    if (!title) {
        showToast("Please enter a title first.", "warning");
        return;
    }

    const summary = SummaryAI.generateInstantSummary(title, author, category);
    document.getElementById("book-desc").value = summary;
    showToast("AI Summary Generated!", "success");
}

console.log("Campus Library Web App ready.");
