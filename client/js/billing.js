// ==================== BILLING PAGE FUNCTIONALITY ====================

// Initialize Lucide icons
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    loadBillingData();
});

// Your existing paywall integration functions
function openPaywall(planType) {
    const modal = document.getElementById('paywallModal');
    const container = document.getElementById('paywallContainer');
    
    // Clear previous content
    container.innerHTML = '';
    
    // Load your existing paywall here
    // This is where you integrate with your backend
    if (planType === 'premium') {
        // Load premium paywall
        container.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2 style="font-size: 2rem; margin-bottom: 16px;">Upgrade to Premium</h2>
                <p style="color: var(--text-muted); margin-bottom: 32px;">Your paywall content loads here...</p>
                <!-- Your existing paywall iframe or component -->
            </div>
        `;
    } else if (planType === 'pro') {
        // Load Pro paywall
        container.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2 style="font-size: 2rem; margin-bottom: 16px;">Upgrade to Pro</h2>
                <p style="color: var(--text-muted); margin-bottom: 32px;">Your paywall content loads here...</p>
                <!-- Your existing paywall iframe or component -->
            </div>
        `;
    }
    
    modal.classList.add('active');
}

function closePaywall() {
    const modal = document.getElementById('paywallModal');
    modal.classList.remove('active');
}

// Close modal on outside click
document.getElementById('paywallModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'paywallModal') {
        closePaywall();
    }
});

// Load billing data from your backend
async function loadBillingData() {
    try {
        // Replace with your actual API endpoint
        const response = await fetch('/api/billing/data');
        const data = await response.json();
        
        // Update current plan
        updateCurrentPlan(data.currentPlan);
        
        // Update payment history
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
    const badge = document.getElementById('currentPlanBadge');
    const name = document.getElementById('currentPlanName');
    const price = document.getElementById('currentPlanPrice');
    
    if (plan) {
        badge.textContent = plan.name;
        badge.setAttribute('data-plan', plan.type);
        name.textContent = `${plan.name} Plan`;
        price.innerHTML = `R${plan.price}<span>/month</span>`;
        
        // Update features
        const featuresContainer = document.getElementById('currentPlanFeatures');
        featuresContainer.innerHTML = plan.features.map(feature => `
            <div class="feature-item">
                <i data-lucide="check-circle" class="feature-icon"></i>
                <span>${feature}</span>
            </div>
        `).join('');
        
        lucide.createIcons();
        
        // Update button state
        const upgradeBtn = document.getElementById('upgradePlanBtn');
        const selectFreeBtn = document.getElementById('selectFreePlan');
        
        if (plan.type === 'free') {
            upgradeBtn.style.display = 'flex';
            if (selectFreeBtn) selectFreeBtn.disabled = true;
            selectFreeBtn.textContent = 'Current Plan';
        } else {
            upgradeBtn.style.display = 'none';
            if (selectFreeBtn) {
                selectFreeBtn.disabled = true;
                selectFreeBtn.textContent = 'Downgrade to Free';
            }
        }
    }
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
    if (details) {
        document.getElementById('billingEmail').value = details.email || '';
        document.getElementById('billingName').value = details.name || '';
        document.getElementById('billingCompany').value = details.company || '';
        document.getElementById('billingCountry').value = details.country || 'ZA';
        document.getElementById('billingPostal').value = details.postalCode || '';
        
        // Update payment methods
        updatePaymentMethods(details.paymentMethods);
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

// Demo data for testing (remove when integrating with real backend)
function loadDemoData() {
    const demoData = {
        currentPlan: {
            type: 'premium',
            name: 'Premium',
            price: 299,
            features: [
                'Unlimited CV analyses',
                'Advanced career discovery',
                'Unlimited interview simulations',
                'Skill gap analysis',
                'Progress tracking'
            ]
        },
        paymentHistory: [
            {
                date: '2026-08-20',
                description: 'Premium Plan - Monthly',
                amount: 299,
                status: 'paid',
                invoiceId: 'INV-2026-0820'
            },
            {
                date: '2026-07-20',
                description: 'Premium Plan - Monthly',
                amount: 299,
                status: 'paid',
                invoiceId: 'INV-2026-0720'
            },
            {
                date: '2026-06-20',
                description: 'Premium Plan - Monthly',
                amount: 299,
                status: 'paid',
                invoiceId: 'INV-2026-0620'
            }
        ],
        billingDetails: {
            email: 'user@example.com',
            name: 'John Doe',
            company: '',
            country: 'ZA',
            postalCode: '2000',
            paymentMethods: [
                {
                    id: 'pm_1',
                    cardBrand: 'Visa',
                    lastFour: '4242',
                    expiry: '12/2027'
                }
            ]
        }
    };
    
    updateCurrentPlan(demoData.currentPlan);
    updatePaymentHistory(demoData.paymentHistory);
    updateBillingDetails(demoData.billingDetails);
}