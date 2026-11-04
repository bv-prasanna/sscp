/* Small progressive enhancements; website content works without JavaScript. */
(() => {
  'use strict';
  const menuButton = document.querySelector('.mobile-menu-btn');
  const nav = document.getElementById('primary-navigation');
  const closeMenu = () => {
    nav?.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', 'Open navigation');
  };
  menuButton?.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    document.body.classList.toggle('menu-open', isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => {
    if (nav?.classList.contains('is-open') && !nav.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });

  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

  const revealEls = [...document.querySelectorAll('.js-reveal')];
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
      });
    }, { threshold: .08, rootMargin: '0px 0px 40px 0px' });
    revealEls.forEach(el => observer.observe(el));
  } else revealEls.forEach(el => el.classList.add('in-view'));

  // Three floating buttons: email/WhatsApp are links; back-to-top is a button.
  const topButton = document.querySelector('.floating-top');
  topButton?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));

  const form = document.getElementById('enquiry-form');
  if (!form) return;
  const status = document.getElementById('form-status');
  const submit = document.getElementById('send-enquiry');
  const note = document.getElementById('form-config-note');
  const unavailable = document.getElementById('form-unavailable');
  const interest = document.getElementById('enq-interest');
  const fileInput = document.getElementById('enq-drawing');
  const drawingHelp = document.getElementById('drawing-help');
  const initialButton = submit.innerHTML;
  const requestedInterest = new URLSearchParams(location.search).get('interest');
  if (requestedInterest && [...interest.options].some(option => option.value === requestedInterest)) interest.value = requestedInterest;

  let enabled = false;
  let captchaId = null;
  const showStatus = (message, kind = '') => {
    status.textContent = message;
    status.className = 'form-status' + (kind ? ` is-${kind}` : '');
  };
  const setDisabled = value => {
    submit.disabled = value;
    submit.setAttribute('aria-busy', String(value));
  };

  // Never show a dead submission form when the backend isn't fully configured.
  // The fallback offers immediate contact without exposing secrets or faking a send.
  const showUnavailable = (message) => {
    enabled = false;
    setDisabled(true);
    form.hidden = true;
    if (unavailable) {
      unavailable.hidden = false;
      const detail = unavailable.querySelector('p');
      if (detail) detail.textContent = message;
    }
    note.textContent = '';
  };

  async function initEnquiry() {
    let response;
    try {
      response = await fetch('/api/enquiry/config', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Service response failed');
      const config = await response.json();
      if (!config || config.configured !== true || !config.siteKey) {
        showUnavailable('The secure email service is being configured. For now, please send your specifications directly by email or WhatsApp.');
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => {
        try {
          if (!window.turnstile || typeof window.turnstile.render !== 'function') throw new Error('Turnstile unavailable');
          captchaId = window.turnstile.render('#turnstile-mount', {
            sitekey: config.siteKey,
            theme: 'auto',
            action: 'sscp_enquiry',
            callback: () => showStatus(''),
            'expired-callback': () => showStatus('Verification expired. Please complete it again.', 'error'),
            'error-callback': () => showStatus('Security verification could not complete. Please retry or contact us by email.', 'error')
          });
          enabled = true;
          form.hidden = false;
          if (unavailable) unavailable.hidden = true;
          setDisabled(false);
          note.textContent = 'Secure form ready — your enquiry will be emailed to the SSCP sales team.';
          note.classList.remove('error');
        } catch {
          showUnavailable('The security verification could not start. Please send your specifications by email or WhatsApp.');
        }
      };
      script.onerror = () => showUnavailable('The security verification could not load. Please contact our sales team by email or WhatsApp.');
      document.head.appendChild(script);
    } catch {
      showUnavailable('The enquiry service is temporarily unavailable. Please contact our sales team by email or WhatsApp.');
    }
  }

  fileInput?.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    drawingHelp.textContent = f ? `${f.name} · ${(f.size/1024/1024).toFixed(2)} MB` : 'PDF, PNG or JPG only; maximum 4 MB. For CAD or larger files, email the sales team directly.';
  });
  const encodeFile = async file => {
    if (!file) return null;
    if (file.size>4*1024*1024) throw new Error('The drawing exceeds 4 MB. Please send it directly by email.');
    if (!['application/pdf','image/png','image/jpeg'].includes(file.type)) throw new Error('Only PDF, PNG and JPG drawings are accepted.');
    const content = await new Promise((resolve,reject) => {
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Unable to read the attached drawing.'));
      reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
      reader.readAsDataURL(file);
    });
    return {name:file.name,type:file.type,size:file.size,content};
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity() || !enabled) return;
    const token = captchaId !== null ? window.turnstile?.getResponse(captchaId) : '';
    if (!token) { showStatus('Please complete the anti-spam verification before sending.', 'error'); return; }
    setDisabled(true);
    submit.textContent='Sending enquiry…';
    showStatus('Submitting your enquiry securely…');
    try {
      const data=Object.fromEntries(new FormData(form).entries());
      delete data.drawing;
      data.consent=form.elements.consent.checked ? 'yes' : 'no';
      data.turnstileToken=token;
      data.attachment=await encodeFile(fileInput?.files?.[0]);
      const response = await fetch('/api/enquiry', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin', body: JSON.stringify(data)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Could not send the enquiry.');
      showStatus('Thank you! Your enquiry was accepted by our email service and sent to the SSCP sales team. We will respond as soon as possible.', 'success');
      form.reset();
      if (drawingHelp) drawingHelp.textContent='PDF, PNG or JPG only; maximum 4 MB. For CAD or larger files, email the sales team directly.';
    } catch (error) {
      showStatus((error.message || 'Submission failed.') + ' You can also email sales@sscircuitproducts.com.', 'error');
    } finally {
      if (captchaId !== null) window.turnstile?.reset(captchaId);
      setDisabled(false);
      submit.innerHTML=initialButton;
    }
  });
  initEnquiry();
})();
