// ========== CONSTANTS ==========
const API_TRIGGER_URL = "/webhook/trigger-repayment-api";
const DELAY_MS = 55000;
const MAX_SELECTION = 20;

let isProcessing = false;
let USER_BALANCE_MAP = {};

// ========== HELPER FUNCTIONS ==========
function formatNumber(value) {
  if (!value && value !== 0) return "0";
  return value.toLocaleString("id-ID");
}

function escapeHtmlSummary(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatNumberSummary(value) {
  if (!value && value !== 0) return "0";
  return value.toLocaleString("id-ID");
}

// ========== FILTER & SEARCH ==========
function filterByClick(element) {
  var filterValue = element.getAttribute("data-filter-value");
  document.getElementById("searchInput").value = filterValue;
  filterTable();
}

function filterTable() {
  var searchTerm = document.getElementById("searchInput").value.trim().toLowerCase();
  var tbody = document.getElementById("dataTable").getElementsByTagName("tbody")[0];
  var rows = tbody.getElementsByTagName("tr");
  var visibleCount = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var loanIdCell = row.cells[1];
    var dueDateCell = row.cells[2];
    var show = false;

    if (searchTerm === "") {
      show = true;
    } else {
      var loanId = loanIdCell ? loanIdCell.textContent.trim().toLowerCase() : "";
      var dueDate = dueDateCell ? dueDateCell.textContent.trim().toLowerCase() : "";

      if (loanId.indexOf(searchTerm) !== -1 || dueDate.indexOf(searchTerm) !== -1) {
        show = true;
      }
    }

    if (show) {
      row.style.display = "";
      visibleCount++;
    } else {
      row.style.display = "none";
    }
  }
  document.getElementById("filteredCount").textContent = visibleCount;
  updateBalanceSummary();
  updateBulkButton();
}

function clearSearch() {
  document.getElementById("searchInput").value = "";
  filterTable();
}

// ========== BALANCE SUMMARY ==========
function updateBalanceSummary() {
  var tbody = document.getElementById("dataTable").getElementsByTagName("tbody")[0];
  if (!tbody) return;
  var rows = tbody.getElementsByTagName("tr");
  var summaryMap = {};

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.style.display !== "none") {
      var nameCell = row.cells[10];
      if (!nameCell) continue;
      var userId = nameCell.getAttribute("data-user-id");
      var balance = parseFloat(nameCell.getAttribute("data-balance") || 0);
      var borrowerName = nameCell.textContent.trim() || userId || "Unknown";

      if (userId && !summaryMap[userId]) {
        summaryMap[userId] = {
          name: borrowerName,
          balance: balance
        };
      }
    }
  }

  var summaryContent = document.getElementById("summaryContent");
  if (!summaryContent) return;
  var summaryHtml = "";
  var totalBorrowers = Object.keys(summaryMap).length;

  if (totalBorrowers === 0) {
    summaryHtml = '<div class="summary-empty">Tidak ada data yang tampil</div>';
  } else {
    var sorted = Object.values(summaryMap).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      summaryHtml += '<div class="summary-row">' +
        '<span class="summary-borrower">👤 ' + escapeHtmlSummary(item.name) + '</span>' +
        '<span class="summary-balance">Rp ' + formatNumberSummary(item.balance) + '</span>' +
        "</div>";
    }
    summaryHtml = '<div class="summary-total-borrowers">📋 ' + totalBorrowers + " borrower(s)</div>" + summaryHtml;
  }
  summaryContent.innerHTML = summaryHtml;
}

// ========== CHECKBOX SELECTION ==========
function getSelectedCount() {
  var visibleCheckboxes = document.querySelectorAll("#dataTable tbody tr:not([style*='display: none']) .loan-checkbox:not(:disabled)");
  var selectedCount = 0;
  for (var i = 0; i < visibleCheckboxes.length; i++) {
    if (visibleCheckboxes[i].checked) selectedCount++;
  }
  return selectedCount;
}

function getTotalVisibleCount() {
  var visibleCheckboxes = document.querySelectorAll("#dataTable tbody tr:not([style*='display: none']) .loan-checkbox:not(:disabled)");
  return visibleCheckboxes.length;
}

function updateToggleButton() {
  var toggleBtn = document.getElementById("toggleSelectBtn");
  if (!toggleBtn) return;

  var selectedCount = getSelectedCount();
  var totalVisible = getTotalVisibleCount();

  if (selectedCount === totalVisible && totalVisible > 0) {
    toggleBtn.textContent = "✗ All";
    toggleBtn.style.background = "#ef4444";
  } else {
    toggleBtn.textContent = "✓ All";
    toggleBtn.style.background = "#16a34a";
  }
}

function updateBulkButton() {
  var selectedCount = getSelectedCount();
  var bulkBtn = document.getElementById("bulkPayBtn");
  var msgDiv = document.getElementById("validationMessage");
  var hasError = msgDiv && msgDiv.className === "validation-error";
  var overLimit = selectedCount > MAX_SELECTION;

  if (bulkBtn) {
    var shouldDisable = selectedCount === 0 || isProcessing || hasError || overLimit;
    bulkBtn.disabled = shouldDisable;
    bulkBtn.textContent = "💰 Pay All (" + selectedCount + ")";

    if (!shouldDisable) {
      bulkBtn.style.backgroundColor = "#16a34a";
      bulkBtn.style.cursor = "pointer";
    } else {
      bulkBtn.style.backgroundColor = "#9ca3af";
      bulkBtn.style.cursor = "not-allowed";
    }
  }
  updateToggleButton();
}

function validateSelection() {
  var checkboxes = document.querySelectorAll(".loan-checkbox:checked:not(:disabled)");
  var selectedCount = checkboxes.length;
  var warningDiv = document.getElementById("maxSelectWarning");

  if (selectedCount > MAX_SELECTION) {
    warningDiv.style.display = "block";
  } else {
    warningDiv.style.display = "none";
  }

  var groupedByUser = {};
  for (var i = 0; i < checkboxes.length; i++) {
    var cb = checkboxes[i];
    var userId = cb.getAttribute("data-user-id");
    var amount = parseFloat(cb.getAttribute("data-amount") || 0);
    if (!userId) continue;
    if (!groupedByUser[userId]) {
      groupedByUser[userId] = { total: 0, balance: USER_BALANCE_MAP[userId] || 0, borrowerName: "" };
    }
    groupedByUser[userId].total += amount;
    if (!groupedByUser[userId].borrowerName) {
      var row = cb.closest("tr");
      if (row) {
        var nameCell = row.cells[10];
        if (nameCell) {
          groupedByUser[userId].borrowerName = nameCell.textContent.trim();
        }
      }
      if (!groupedByUser[userId].borrowerName) groupedByUser[userId].borrowerName = userId;
    }
  }
  var hasError = false;
  var messages = [];
  for (var userId in groupedByUser) {
    var data = groupedByUser[userId];
    if (data.total > data.balance) {
      hasError = true;
      messages.push("❌ " + data.borrowerName + ": Rp " + formatNumber(data.total) + " > Balance Rp " + formatNumber(data.balance));
    } else if (data.total === data.balance && data.total > 0) {
      messages.push("⚠️ " + data.borrowerName + ": Rp " + formatNumber(data.total) + " = Balance Rp " + formatNumber(data.balance) + " (full)");
    }
  }
  var msgDiv = document.getElementById("validationMessage");
  if (hasError) {
    msgDiv.style.display = "block";
    msgDiv.className = "validation-error";
    msgDiv.innerHTML = "<strong>❌ VALIDATION ERROR - Cannot proceed</strong><br><br>" + messages.join("<br>");
  } else if (messages.length > 0) {
    msgDiv.style.display = "block";
    msgDiv.className = "validation-warning";
    msgDiv.innerHTML = "<strong>⚠️ VALIDATION WARNING</strong><br><br>" + messages.join("<br>");
  } else {
    msgDiv.style.display = "none";
  }
  updateBulkButton();
}

// ========== ROUND ROBIN QUEUE ==========
function buildRoundRobinQueue(selectedLoans) {
  var groupedByUser = {};
  for (var i = 0; i < selectedLoans.length; i++) {
    var loan = selectedLoans[i];
    var userId = loan.userId;
    if (!groupedByUser[userId]) groupedByUser[userId] = [];
    groupedByUser[userId].push({ loan_id: loan.loanId, amount: loan.amount });
  }

  var queue = [];
  var hasRemaining = true;
  var userIds = Object.keys(groupedByUser);

  while (hasRemaining) {
    var batch = [];
    hasRemaining = false;

    for (var i = 0; i < userIds.length; i++) {
      var userId = userIds[i];
      if (groupedByUser[userId].length > 0) {
        batch.push(groupedByUser[userId].shift());
        if (groupedByUser[userId].length > 0) {
          hasRemaining = true;
        }
      }
    }
    if (batch.length > 0) queue.push(batch);
  }
  return queue;
}

// ========== MODAL ==========
function showModal(title, body, type) {
  var modal = document.getElementById("responseModal");
  var modalHeader = document.getElementById("modalHeader");
  var modalTitle = document.getElementById("modalTitle");
  var modalBody = document.getElementById("modalBody");
  modalHeader.className = "modal-header " + (type || "success");
  modalTitle.textContent = title || (type === "error" ? "Error" : "Success");
  if (typeof body === "object") {
    modalBody.textContent = JSON.stringify(body, null, 2);
  } else {
    modalBody.textContent = body;
  }
  modal.style.display = "block";
}

function closeModal() {
  document.getElementById("responseModal").style.display = "none";
}

// ========== BULK REPAYMENT ==========
async function bulkRepayment() {
  if (isProcessing) {
    showModal("⚠️ Process Running", "Please wait for the current process to complete.", "warning");
    return;
  }

  var checkboxes = document.querySelectorAll(".loan-checkbox:checked:not(:disabled)");
  if (checkboxes.length === 0) {
    showModal("⚠️ No Data", "Please select invoices to repay.", "warning");
    return;
  }

  // Group & sum amount per loan_id
  var loanMap = {};
  for (var i = 0; i < checkboxes.length; i++) {
    var cb = checkboxes[i];
    var loanId = cb.getAttribute("data-loan-id");
    var userId = cb.getAttribute("data-user-id");
    var amount = parseFloat(cb.getAttribute("data-amount") || 0);

    if (!loanMap[loanId]) {
      loanMap[loanId] = {
        loanId: loanId,
        userId: userId,
        amount: 0
      };
    }
    loanMap[loanId].amount += amount;
  }

  var selectedLoans = Object.values(loanMap);
  var SOURCE_ENV = document.querySelector("input[name='source']") ? document.querySelector("input[name='source']").value : "CL1";

  if (selectedLoans.length > MAX_SELECTION) {
    showModal("⚠️ Melebihi Batas", "Maksimal hanya bisa memilih " + MAX_SELECTION + " loan ID. Saat ini Anda memilih " + selectedLoans.length + " loan ID.", "warning");
    return;
  }

  // Balance validation
  var balanceCheck = {};
  for (var i = 0; i < selectedLoans.length; i++) {
    var loan = selectedLoans[i];
    var userId = loan.userId;
    if (!balanceCheck[userId]) {
      balanceCheck[userId] = { total: 0, balance: USER_BALANCE_MAP[userId] || 0, borrowerName: "" };
    }
    balanceCheck[userId].total += loan.amount;
    if (!balanceCheck[userId].borrowerName) {
      for (var j = 0; j < checkboxes.length; j++) {
        if (checkboxes[j].getAttribute("data-loan-id") === loan.loanId) {
          var row = checkboxes[j].closest("tr");
          if (row) {
            var nameCell = row.cells[10];
            if (nameCell) {
              balanceCheck[userId].borrowerName = nameCell.textContent.trim();
            }
          }
          break;
        }
      }
      if (!balanceCheck[userId].borrowerName) balanceCheck[userId].borrowerName = userId;
    }
  }

  for (var userId in balanceCheck) {
    var data = balanceCheck[userId];
    if (data.total > data.balance) {
      showModal("❌ Insufficient Balance", "Total repayment " + data.borrowerName + ": Rp " + formatNumber(data.total) + " exceeds balance Rp " + formatNumber(data.balance), "error");
      return;
    }
  }

  var requestQueue = buildRoundRobinQueue(selectedLoans);
  var confirmMsg = "You will repay " + selectedLoans.length + " loan(s) in " + requestQueue.length + " batch(es).\n\n";
  for (var i = 0; i < requestQueue.length; i++) {
    confirmMsg += "Batch " + (i + 1) + ": " + requestQueue[i].map(function(l) { return l.loan_id; }).join(", ") + "\n";
  }
  confirmMsg += "\nJeda antar batch: 55 detik.\n\nContinue?";
  if (!confirm(confirmMsg)) return;

  isProcessing = true;
  var bulkPayBtn = document.getElementById("bulkPayBtn");
  var progressContainer = document.getElementById("progressContainer");
  var progressBar = document.getElementById("progressBar");
  var progressStatus = document.getElementById("progressStatus");
  bulkPayBtn.disabled = true;
  bulkPayBtn.textContent = "⏳ Processing...";
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";

  var allCheckboxes = [];
  for (var i = 0; i < checkboxes.length; i++) allCheckboxes.push(checkboxes[i]);

  var results = [];
  for (var batchIdx = 0; batchIdx < requestQueue.length; batchIdx++) {
    var batch = requestQueue[batchIdx];
    progressBar.style.width = (batchIdx / requestQueue.length * 100) + "%";
    progressStatus.textContent = "Processing batch " + (batchIdx + 1) + "/" + requestQueue.length + "...";

    var payload = { source: SOURCE_ENV, loans: batch };
    try {
      var response = await fetch(API_TRIGGER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var result;
      try { result = await response.json(); } catch (e) { result = { message: await response.text() }; }
      results.push({ batch: batchIdx + 1, loans: batch, success: response.ok, response: result });

      if (response.ok) {
        for (var i = 0; i < batch.length; i++) {
          var loanId = batch[i].loan_id;
          for (var j = 0; j < allCheckboxes.length; j++) {
            if (allCheckboxes[j].getAttribute("data-loan-id") === loanId) {
              allCheckboxes[j].checked = false;
              allCheckboxes[j].disabled = true;
              break;
            }
          }
        }
      }
      progressBar.style.width = ((batchIdx + 1) / requestQueue.length * 100) + "%";
      progressStatus.textContent = "Batch " + (batchIdx + 1) + " completed!";

      if (batchIdx < requestQueue.length - 1) {
        progressStatus.textContent = "Waiting 55 seconds before next batch...";
        await new Promise(function(resolve) { setTimeout(resolve, DELAY_MS); });
      }
    } catch (error) {
      results.push({ batch: batchIdx + 1, loans: batch, success: false, error: error.message });
      progressBar.style.width = ((batchIdx + 1) / requestQueue.length * 100) + "%";
      progressStatus.textContent = "Batch " + (batchIdx + 1) + " failed!";
      if (batchIdx < requestQueue.length - 1) {
        progressStatus.textContent = "Error, waiting 55 seconds...";
        await new Promise(function(resolve) { setTimeout(resolve, DELAY_MS); });
      }
    }
  }

  progressBar.style.width = "100%";
  progressStatus.textContent = "All batches processed!";

  var successCount = 0, failCount = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i].success) successCount++;
    else failCount++;
  }

  showModal("✅ Repayment Completed", {
    total_batches: requestQueue.length,
    success_batches: successCount,
    failed_batches: failCount,
    details: results
  }, successCount === requestQueue.length ? "success" : "error");

  if (successCount === requestQueue.length) {
    var refreshInfo = document.getElementById("refreshInfo");
    var countdown = 3;
    refreshInfo.textContent = "Refreshing in " + countdown + " seconds...";
    var interval = setInterval(function() {
      countdown--;
      if (countdown > 0) {
        refreshInfo.textContent = "Refreshing in " + countdown + " seconds...";
      } else {
        clearInterval(interval);
        window.location.href = window.location.pathname;
      }
    }, 1000);
  }

  setTimeout(function() {
    isProcessing = false;
    bulkPayBtn.disabled = false;
    progressContainer.style.display = "none";
    progressBar.style.width = "0%";
    updateBulkButton();
  }, 3000);
}

// ========== TOGGLE SELECT ALL ==========
function setupToggleButton() {
  var toggleBtn = document.getElementById("toggleSelectBtn");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", function() {
    var visibleCheckboxes = document.querySelectorAll("#dataTable tbody tr:not([style*='display: none']) .loan-checkbox:not(:disabled)");
    var selectedCount = getSelectedCount();
    var totalVisible = visibleCheckboxes.length;

    if (toggleBtn.textContent === "✗ All") {
      for (var i = 0; i < visibleCheckboxes.length; i++) {
        visibleCheckboxes[i].checked = false;
      }
      validateSelection();
      return;
    }

    var willSelectCount = 0;
    for (var i = 0; i < visibleCheckboxes.length; i++) {
      if (!visibleCheckboxes[i].checked) willSelectCount++;
    }
    var newTotal = selectedCount + willSelectCount;

    if (newTotal > MAX_SELECTION) {
      var selectedCountLimit = 0;
      for (var i = 0; i < visibleCheckboxes.length && selectedCountLimit < MAX_SELECTION; i++) {
        if (!visibleCheckboxes[i].checked) {
          visibleCheckboxes[i].checked = true;
          selectedCountLimit++;
        }
      }
      showModal("⚠️ Batas Maksimal", "Hanya bisa memilih maksimal " + MAX_SELECTION + " loan ID. " + selectedCountLimit + " loan ID dipilih.", "warning");
    } else {
      for (var i = 0; i < visibleCheckboxes.length; i++) {
        visibleCheckboxes[i].checked = true;
      }
    }
    validateSelection();
  });
}

// ========== UPDATE DATE & TIME WITH BLINKING ==========
function updateDateTime() {
  var now = new Date();
  var year = now.getFullYear();
  var month = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  var hours = String(now.getHours()).padStart(2, "0");
  var minutes = String(now.getMinutes()).padStart(2, "0");
  var seconds = String(now.getSeconds()).padStart(2, "0");

  var dateElement = document.getElementById("currentDate");
  var timeElement = document.getElementById("blinkingTime");

  if (dateElement) dateElement.textContent = day + "/" + month + "/" + year;
  if (timeElement) {
    timeElement.innerHTML = hours + ":" + minutes + ":" + seconds;
    timeElement.classList.add("blinking");
  }
}

// ========== INITIALIZATION ==========
function init() {
  updateBalanceSummary();
  updateBulkButton();
  setupToggleButton();
  updateDateTime();
  setInterval(updateDateTime, 1000);

  window.onclick = function(event) {
    var modal = document.getElementById("responseModal");
    if (event.target === modal) closeModal();
  };
}

// Set USER_BALANCE_MAP dari data yang disisipkan server
if (typeof window.USER_BALANCE_MAP !== "undefined") {
  USER_BALANCE_MAP = window.USER_BALANCE_MAP;
}

// Jalankan init saat halaman selesai loading
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
