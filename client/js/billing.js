// ==================== BILLING PAGE FUNCTIONALITY ====================

// Initialize Lucide icons
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    loadBillingData();
});

// Auto-renewal toggle
document.getElementById('autoRenewal')?.addEventListener('change', async (e) => {
    const newValue = e.target.checked;
    const token = localStorage.getItem('sb-access-token');

    try {
        const response = await fetch('/api/billing/auto-renew', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ autoRenew: newValue }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Revert the toggle visually since the change didn't actually save
            e.target.checked = !newValue;
            alert(data.error || 'Failed to update auto-renewal setting.');
            return;
        }
    } catch (error) {
        console.error('Error updating auto-renewal:', error);
        e.target.checked = !newValue;
        alert('Failed to update auto-renewal setting. Please try again.');
    }
});

// ---- Plan catalog: single source of truth for plan card content ----
// Keep this in sync with what plan_type values exist in the DB.
const PLAN_CATALOG = {
    free: {
        name: 'Free',
        price: 0,
        features: [
            '5 CV analyses per month',
            'Basic career discovery',
            '3 interview simulations'
        ]
    },
    premium: {
        name: 'Premium',
        price: 149,
        features: [
            'Unlimited CV analyses',
            'Advanced career discovery',
            'Unlimited interview sims',
            'Skill gap analysis',
            'Progress tracking'
        ]
    }
};

// Ranked low -> high so we know whether a given card is an "upgrade" or
// "downgrade" relative to the user's current plan_type.
const PLAN_ORDER = ['free', 'premium'];

// Add event listener for Premium plan upgrade button
document.addEventListener('DOMContentLoaded', () => {
  const premiumUpgradeBtn = document.querySelector('.plan-card-btn.primary');
  
  if (premiumUpgradeBtn) {
    premiumUpgradeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'payments.html';
    });
  }
  
  // Also ensure the first button works
  const upgradePlanBtn = document.getElementById('upgradePlanBtn');
  if (upgradePlanBtn) {
    upgradePlanBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'payments.html';
    });
  }
});

// Load billing data from your backend
async function loadBillingData() {
    try {
        // Same token key auth.js reads/writes on login and logout.
        const token = localStorage.getItem('sb-access-token');

        if (!token) {
            // Not logged in (or token hasn't been saved yet) — don't bother
            // calling an endpoint that will just 401.
            loadDemoData();
            return;
        }

        const response = await fetch('/api/billing/data', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            // Session expired/invalid — send them back to log in rather than
            // silently showing demo data as if it were their real billing info.
            localStorage.removeItem('sb-access-token');
            window.location.href = 'LogIn.html';
            return;
        }

        if (!response.ok) throw new Error('Request failed');
        const data = await response.json();

        // plan_type is the source of truth from the DB. Map it defensively
        // in case it comes back nested differently (data.plan_type,
        // data.user.plan_type, or already inside data.currentPlan.type).
        const planType = data.currentPlan?.type || data.plan_type || data.user?.plan_type || 'free';

        updateCurrentPlan({ ...data.currentPlan, type: planType });
        updatePaymentHistory(data.paymentHistory);
        
        // Update billing details
        updateBillingDetails(data.billingDetails);
        
    } catch (error) {
        console.error('Error loading billing data:', error);
        // Show error state or use demo data
        loadDemoData();
    }
}

function updateCurrentPlan(plan) {
    if (!plan || !plan.type) return;

    const planType = plan.type;
    const catalogEntry = PLAN_CATALOG[planType] || PLAN_CATALOG.free;

    const badge = document.getElementById('currentPlanBadge');
    const name = document.getElementById('currentPlanName');
    const price = document.getElementById('currentPlanPrice');
    const overviewCard = document.querySelector('.plan-overview-card');
    const iconWrapper = document.querySelector('.plan-icon-wrapper');

    const displayName = plan.name || catalogEntry.name;
    const displayPrice = plan.price ?? catalogEntry.price;
    const displayFeatures = (plan.features && plan.features.length) ? plan.features : catalogEntry.features;

    badge.textContent = displayName;
    badge.setAttribute('data-plan', planType);
    overviewCard.setAttribute('data-plan', planType);
    iconWrapper.setAttribute('data-plan', planType);
    name.textContent = `${displayName} Plan`;
    price.innerHTML = displayPrice > 0 ? `R${displayPrice}<span>/month</span>` : `R0<span>/month</span>`;

    const featuresContainer = document.getElementById('currentPlanFeatures');
    featuresContainer.innerHTML = displayFeatures.map(feature => `
        <div class="feature-item">
            <i data-lucide="check-circle" class="feature-icon"></i>
            <span>${feature}</span>
        </div>
    `).join('');

    // Next billing date only means something once you're actually paying.
    const nextBillingEl = document.getElementById('nextBillingDate');
    if (nextBillingEl) {
        nextBillingEl.textContent = plan.nextBillingDate
            ? new Date(plan.nextBillingDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
            : '—';
    }

    highlightPlanCards(planType);
    updateTopLevelActions(planType);
    applyPlanBasedVisibility(planType);

    lucide.createIcons();
}

// Highlight the plan card matching the user's plan_type, and set the
// correct call-to-action (Upgrade / Downgrade / Current Plan) on every card.
function highlightPlanCards(planType) {
    document.querySelectorAll('.plan-card').forEach(card => {
        const cardPlan = card.dataset.plan;
        const btn = card.querySelector('.plan-card-btn');
        const isCurrent = cardPlan === planType;

        card.classList.toggle('current-plan', isCurrent);
        // Inline fallback highlight in case Billing.css doesn't yet have a
        // .plan-card.current-plan rule — safe to remove once it does.
        card.style.outline = isCurrent ? '2px solid #6C5CE7' : '';
        card.style.outlineOffset = isCurrent ? '2px' : '';

        if (!btn) return;

        if (isCurrent) {
            btn.disabled = true;
            btn.classList.remove('primary');
            btn.innerHTML = 'Current Plan';
            btn.onclick = null;
            return;
        }

        btn.disabled = false;
        const currentIndex = PLAN_ORDER.indexOf(planType);
        const cardIndex = PLAN_ORDER.indexOf(cardPlan);
        const isUpgrade = cardIndex > currentIndex;
        const targetName = PLAN_CATALOG[cardPlan]?.name || cardPlan;

        btn.innerHTML = isUpgrade
            ? `<i data-lucide="zap"></i> Upgrade to ${targetName}`
            : `Downgrade to ${targetName}`;
        btn.onclick = isUpgrade ? () => openPaywall(cardPlan) : () => confirmDowngrade(cardPlan);
    });
}

// The big "Upgrade to Premium" CTA on the overview card should disappear
// once there's no higher tier left to upgrade to.
function updateTopLevelActions(planType) {
    const upgradeBtn = document.getElementById('upgradePlanBtn');
    if (!upgradeBtn) return;
    const hasHigherTier = PLAN_ORDER.indexOf(planType) < PLAN_ORDER.length - 1;
    upgradeBtn.style.display = hasHigherTier ? 'flex' : 'none';
}

function confirmDowngrade(planType) {
    const targetName = PLAN_CATALOG[planType]?.name || planType;
    if (confirm(`Downgrade to the ${targetName} plan? You'll lose access to premium features at the end of your billing period.`)) {
        console.log('Downgrade to', planType);
        // Call your API to schedule the downgrade
    }
}

// Free-plan users have no billing history and nothing to cancel — hide
// those sections instead of showing an empty table / disabled button.
function applyPlanBasedVisibility(planType) {
    const isFree = planType === 'free';

    const paymentHistorySection = document.getElementById('paymentHistorySection');
    if (paymentHistorySection) paymentHistorySection.style.display = isFree ? 'none' : '';

    const cancelRow = document.getElementById('cancelSubscriptionRow');
    if (cancelRow) cancelRow.style.display = isFree ? 'none' : '';
}

function updatePaymentHistory(history) {
    const tbody = document.getElementById('paymentHistoryBody');
    const emptyState = document.getElementById('noPaymentsState');

    if (!history || history.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = history.map(payment => `
        <tr class="history-row">
            <td class="date-cell">
                <div class="date-display">
                    <span class="date-day">${new Date(payment.date).getDate()}</span>
                    <span class="date-month">${new Date(payment.date).toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                </div>
            </td>
            <td class="description-cell">
                <span class="description-text">${payment.description}</span>
                <span class="description-sub">Payment ID: #${payment.invoiceId}</span>
            </td>
            <td class="amount-cell">
                <span class="amount-value">R${payment.amount.toFixed(2)}</span>
            </td>
            <td class="status-cell">
                <span class="status-badge ${payment.status}">
                    <i data-lucide="${payment.status === 'paid' ? 'check-circle' : payment.status === 'pending' ? 'clock' : 'x-circle'}"></i>
                    ${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                </span>
            </td>
            <td class="invoice-cell">
                <button class="btn-invoice" onclick="downloadInvoice('${payment.invoiceId}')">
                    <i data-lucide="download"></i>
                    PDF
                </button>
            </td>
        </tr>
    `).join('');
    
    lucide.createIcons();
}

function updateBillingDetails(details) {
    if (!details) return;

    document.getElementById('billingEmail').value = details.email || '';
    document.getElementById('billingName').value = details.name || '';
    document.getElementById('billingCompany').value = details.company || '';
    document.getElementById('billingCountry').value = details.country || 'ZA';
    document.getElementById('billingPostal').value = details.postalCode || '';

    // Reflect the actual saved auto-renew state, not the HTML default
    const autoRenewToggle = document.getElementById('autoRenewal');
    if (autoRenewToggle) {
        autoRenewToggle.checked = Boolean(details.autoRenew);
    }

    updatePaymentMethods(details.paymentMethods);

    const overviewPaymentMethod = document.getElementById('paymentMethod');
    if (overviewPaymentMethod) {
        const primary = details.paymentMethods?.[0];
        overviewPaymentMethod.innerHTML = primary
            ? `<i data-lucide="credit-card"></i><span>${primary.cardBrand} ending in ${primary.lastFour}</span>`
            : `<i data-lucide="credit-card"></i><span>Not added</span>`;
        lucide.createIcons();
    }
}

function updatePaymentMethods(methods) {
    const container = document.getElementById('paymentMethodsList');

    if (!methods || methods.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                <p>No payment methods added</p>
            </div>
        `;
        return;
    }

    container.innerHTML = methods.map((method, index) => `
        <div class="payment-method-item ${index === 0 ? 'active' : ''}">
            <div class="payment-method-icon">
                <i data-lucide="credit-card"></i>
            </div>
            <div class="payment-method-info">
                <span class="payment-method-name">${method.cardBrand} ending in ${method.lastFour}</span>
                <span class="payment-method-expiry">Expires ${method.expiry}</span>
            </div>
            <div class="payment-method-actions">
                <button class="btn-method-action" onclick="editPaymentMethod('${method.id}')">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="btn-method-action" onclick="removePaymentMethod('${method.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

function downloadInvoice(invoiceId) {
    // Replace with your actual invoice download endpoint
    window.open(`/api/billing/invoices/${invoiceId}/download`, '_blank');
}

function editPaymentMethod(methodId) {
    // Open your payment method editing flow
    console.log('Edit payment method:', methodId);
    // Integrate with your payment processor (Stripe, PayPal, etc.)
}

function removePaymentMethod(methodId) {
    if (confirm('Are you sure you want to remove this payment method?')) {
        // Call your API to remove the payment method
        console.log('Remove payment method:', methodId);
    }
}

// Save billing information
document.getElementById('saveBillingInfo')?.addEventListener('click', async () => {
    const billingData = {
        email: document.getElementById('billingEmail').value,
        name: document.getElementById('billingName').value,
        company: document.getElementById('billingCompany').value,
        country: document.getElementById('billingCountry').value,
        postalCode: document.getElementById('billingPostal').value
    };

    try {
        const response = await fetch('/api/billing/update-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(billingData)
        });

        if (response.ok) {
            alert('Billing information updated successfully!');
        } else {
            throw new Error('Failed to update');
        }
    } catch (error) {
        console.error('Error updating billing info:', error);
        alert('Failed to update billing information. Please try again.');
    }
});

// Add payment method
document.getElementById('addPaymentMethod')?.addEventListener('click', () => {
    // Open your payment method addition flow
    console.log('Add new payment method');
    // Integrate with Stripe Elements, PayPal, etc.
});

// Cancel subscription
document.getElementById('cancelSubscription')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
        // Call your API to cancel subscription
        console.log('Cancel subscription');
    }
});

// Export payment history
document.getElementById('exportHistory')?.addEventListener('click', () => {
    const year = document.getElementById('yearFilter').value;
    window.open(`/api/billing/export?year=${year}`, '_blank');
});

// ---- Demo data for testing (remove once your backend is wired up) ----
// Since real users are on the Free plan right now, that's the default here.
// Append ?plan=premium to the page URL to preview the paid-plan view
// without needing a backend response yet.
function loadDemoData() {
    const params = new URLSearchParams(window.location.search);
    const requestedPlan = params.get('plan');
    const planType = PLAN_CATALOG[requestedPlan] ? requestedPlan : 'free';
    const isFree = planType === 'free';

    const demoData = {
        currentPlan: {
            type: planType,
            nextBillingDate: isFree ? null : '2026-09-20'
        },
        paymentHistory: isFree ? [] : [
            { date: '2026-08-20', description: 'Premium Plan - Monthly', amount: 149, status: 'paid', invoiceId: 'INV-2026-0820' },
            { date: '2026-07-20', description: 'Premium Plan - Monthly', amount: 149, status: 'paid', invoiceId: 'INV-2026-0720' },
            { date: '2026-06-20', description: 'Premium Plan - Monthly', amount: 149, status: 'paid', invoiceId: 'INV-2026-0620' }
        ],
        billingDetails: {
            email: 'user@example.com',
            name: 'John Doe',
            company: '',
            country: 'ZA',
            postalCode: '2000',
            paymentMethods: isFree ? [] : [
                { id: 'pm_1', cardBrand: 'Visa', lastFour: '4242', expiry: '12/2027' }
            ]
        }
    };

    updateCurrentPlan(demoData.currentPlan);
    updatePaymentHistory(demoData.paymentHistory);
    updateBillingDetails(demoData.billingDetails);
}