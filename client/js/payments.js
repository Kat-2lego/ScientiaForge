/* =========================================================
   CONFIG — update these two values for your environment
========================================================= */

// Your Stripe PUBLISHABLE key (starts with pk_test_...), NOT the secret key.
// Safe to expose in frontend code — find it in Stripe Dashboard > API keys.
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51U678MHewt0yzVsxirPkZ0eHxu3WJIBVy9GOfJFg2uVDzTKbn8rw9H0fnV33Qix70s6QZxThvCHu72P5oF5sbxxc00ZhNHY6WG';

// Your backend's base URL
const API_BASE_URL = 'http://localhost:5001';

/* =========================================================
   STRIPE ELEMENTS SETUP
========================================================= */

const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
const elements = stripe.elements();

// Styled to blend with the existing input look. Adjust colors to match
// your CSS variables if you have them defined (e.g. var(--text-color)).
const cardElement = elements.create('card', {
  style: {
    base: {
      fontFamily: "'Inter', sans-serif",
      fontSize: '15px',
      color: '#1a1a1a',
      '::placeholder': { color: '#9a9a9a' },
    },
    invalid: {
      color: '#e5484d',
    },
  },
});

cardElement.mount('#card-element');

cardElement.on('change', (event) => {
  const displayError = document.getElementById('card-errors');
  displayError.textContent = event.error ? event.error.message : '';
  updateGauge();
});

/* =========================================================
   UI STATE / ELEMENT REFERENCES
========================================================= */

const els = {
  submitLabel: document.getElementById('submitLabel'),
  email: document.getElementById('email'),
  cardname: document.getElementById('cardname'),
  gaugeFill: document.getElementById('gaugeFill'),
  gaugePercent: document.getElementById('gaugePercent'),
  form: document.getElementById('payForm'),
  submitBtn: document.getElementById('submitBtn'),
  successState: document.getElementById('successState'),
  formPanel: document.getElementById('formPanel'),
  cardErrors: document.getElementById('card-errors'),
};

let cardComplete = false;

function fieldFilled(el) {
  return el.value.trim().length > 0;
}

function updateGauge() {
  const textFields = [els.email, els.cardname];
  const filledText = textFields.filter(fieldFilled).length;
  const totalSteps = textFields.length + 1; // +1 for the card element
  const filledSteps = filledText + (cardComplete ? 1 : 0);
  const pct = Math.round((filledSteps / totalSteps) * 100);
  els.gaugeFill.style.width = pct + '%';
  els.gaugePercent.textContent = pct + '%';
}

cardElement.on('change', (event) => {
  cardComplete = event.complete;
});

[els.email, els.cardname].forEach((inp) => inp.addEventListener('input', updateGauge));

function setError(fieldId, hasError) {
  const field = document.getElementById(fieldId);
  field.classList.toggle('has-error', hasError);
  const input = field.querySelector('input');
  if (input) input.classList.toggle('invalid', hasError);
}

function validate() {
  let ok = true;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(els.email.value.trim());
  setError('field-email', !emailOk);
  if (!emailOk) ok = false;

  const nameOk = els.cardname.value.trim().length > 1;
  setError('field-name', !nameOk);
  if (!nameOk) ok = false;

  if (!cardComplete) {
    document.getElementById('field-card').classList.add('has-error');
    ok = false;
  } else {
    document.getElementById('field-card').classList.remove('has-error');
  }

  return ok;
}

/* =========================================================
   CHECKOUT SUBMIT
========================================================= */

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  els.submitBtn.disabled = true;
  els.submitLabel.textContent = 'Forging…';
  els.cardErrors.textContent = '';

  try {
    const accessToken = localStorage.getItem('access_token');

    if (!accessToken) {
      throw new Error('You need to be logged in to complete this purchase.');
    }

    // 1. Ask our backend to create the PaymentIntent (server decides the price)
    const intentRes = await fetch(`${API_BASE_URL}/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ productId: 'premium' }),
    });

    const intentData = await intentRes.json();

    if (!intentRes.ok) {
      throw new Error(intentData.error || 'Could not start checkout.');
    }

    // 2. Confirm the payment directly with Stripe using the card element.
    //    The card number/expiry/CVC never leave Stripe's iframe.
    const result = await stripe.confirmCardPayment(intentData.clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: els.cardname.value.trim(),
          email: els.email.value.trim(),
        },
      },
    });

    if (result.error) {
      throw new Error(result.error.message || 'Payment failed.');
    }

    if (result.paymentIntent.status === 'succeeded') {
      els.formPanel.classList.add('hidden-form');
      els.successState.classList.add('show');
    } else {
      throw new Error(`Payment status: ${result.paymentIntent.status}. Please try again.`);
    }
  } catch (err) {
    els.cardErrors.textContent = err.message;
    els.submitBtn.disabled = false;
    els.submitLabel.textContent = 'Forge my plan — R149.00';
  }
});