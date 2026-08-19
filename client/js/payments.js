const state = { cycle: 'monthly', price: 39 };

  const els = {
    cycleButtons: document.querySelectorAll('.cycle-toggle button'),
    cycleText: document.getElementById('cycleText'),
    basePrice: document.getElementById('basePrice'),
    discountRow: document.getElementById('discountRow'),
    discountValue: document.getElementById('discountValue'),
    taxValue: document.getElementById('taxValue'),
    totalValue: document.getElementById('totalValue'),
    submitLabel: document.getElementById('submitLabel'),
    email: document.getElementById('email'),
    cardname: document.getElementById('cardname'),
    cardnumber: document.getElementById('cardnumber'),
    cardBrand: document.getElementById('cardBrand'),
    expiry: document.getElementById('expiry'),
    cvc: document.getElementById('cvc'),
    gaugeFill: document.getElementById('gaugeFill'),
    gaugePercent: document.getElementById('gaugePercent'),
    form: document.getElementById('payForm'),
    submitBtn: document.getElementById('submitBtn'),
    successState: document.getElementById('successState'),
    formPanel: document.getElementById('formPanel'),
  };

  const TAX_RATE = 0.08;

  function fmt(n){ return n.toFixed(2); }

  function updateOrder(){
    let base, discount = 0, cycleLabel;
    if(state.cycle === 'monthly'){
      base = 39;
      cycleLabel = 'billed monthly';
    } else {
      base = 29 * 12;
      discount = 39*12 - 29*12;
      cycleLabel = 'billed annually';
    }
    const subtotal = state.cycle === 'monthly' ? base : (29*12);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;

    els.cycleText.textContent = cycleLabel;
    els.basePrice.textContent = '$' + fmt(state.cycle === 'monthly' ? 39 : 39*12);
    if(discount > 0){
      els.discountRow.style.display = 'flex';
      els.discountValue.textContent = '−$' + fmt(discount);
    } else {
      els.discountRow.style.display = 'none';
    }
    els.taxValue.textContent = '$' + fmt(tax);
    els.totalValue.textContent = fmt(total);
    els.submitLabel.textContent = 'Forge my plan — $' + fmt(total);
  }

  els.cycleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      els.cycleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.cycle = btn.dataset.cycle;
      updateOrder();
    });
  });

  updateOrder();

  /* card number formatting + brand detect */
  els.cardnumber.addEventListener('input', (e) => {
    let digits = e.target.value.replace(/\D/g,'').slice(0,16);
    let groups = digits.match(/.{1,4}/g) || [];
    e.target.value = groups.join(' ');

    let brand = 'card';
    if(/^4/.test(digits)) brand = 'visa';
    else if(/^5[1-5]/.test(digits)) brand = 'mastercard';
    else if(/^3[47]/.test(digits)) brand = 'amex';
    else if(/^6(?:011|5)/.test(digits)) brand = 'discover';
    els.cardBrand.textContent = brand;
    updateGauge();
  });

  /* expiry auto-slash */
  els.expiry.addEventListener('input', (e) => {
    let digits = e.target.value.replace(/\D/g,'').slice(0,4);
    if(digits.length >= 3){
      e.target.value = digits.slice(0,2) + ' / ' + digits.slice(2);
    } else {
      e.target.value = digits;
    }
    updateGauge();
  });

  els.cvc.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g,'').slice(0,4);
    updateGauge();
  });

  [els.email, els.cardname].forEach(inp => inp.addEventListener('input', updateGauge));

  function fieldFilled(el){
    return el.value.trim().length > 0;
  }

  function updateGauge(){
    const fields = [els.email, els.cardname, els.cardnumber, els.expiry, els.cvc];
    const filled = fields.filter(fieldFilled).length;
    const pct = Math.round((filled / fields.length) * 100);
    els.gaugeFill.style.width = pct + '%';
    els.gaugePercent.textContent = pct + '%';
  }

  function setError(fieldId, hasError){
    const field = document.getElementById(fieldId);
    field.classList.toggle('has-error', hasError);
    const input = field.querySelector('input');
    input.classList.toggle('invalid', hasError);
  }

  function validate(){
    let ok = true;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(els.email.value.trim());
    setError('field-email', !emailOk); if(!emailOk) ok = false;

    const nameOk = els.cardname.value.trim().length > 1;
    setError('field-name', !nameOk); if(!nameOk) ok = false;

    const cardDigits = els.cardnumber.value.replace(/\D/g,'');
    const cardOk = cardDigits.length === 16;
    setError('field-card', !cardOk); if(!cardOk) ok = false;

    const expiryOk = /^\d{2} \/ \d{2}$/.test(els.expiry.value.trim());
    setError('field-expiry', !expiryOk); if(!expiryOk) ok = false;

    const cvcOk = els.cvc.value.trim().length >= 3;
    setError('field-cvc', !cvcOk); if(!cvcOk) ok = false;

    return ok;
  }

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if(!validate()) return;

    els.submitBtn.disabled = true;
    els.submitLabel.textContent = 'Forging…';

    setTimeout(() => {
      els.formPanel.classList.add('hidden-form');
      els.successState.classList.add('show');
    }, 900);
  });