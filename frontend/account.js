const $account = selector => document.querySelector(selector);
let currentCustomer = null;
function accountMessage(message) { $account('#accountMessage').textContent = message; }
function showAccountState() {
  const welcome = $account('#accountWelcome');
  if (currentCustomer) {
    $account('#accountOpen').textContent = 'حساب من';
    welcome.hidden = false;
    welcome.textContent = 'سلام ' + currentCustomer.full_name + '؛ به حساب کاربری AVELORA خوش آمدی.';
    const nameField=document.querySelector('#orderForm [name=name]');
    const phoneField=document.querySelector('#orderForm [name=phone]');
    if(nameField && !nameField.value) nameField.value=currentCustomer.full_name;
    if(phoneField && !phoneField.value) phoneField.value=currentCustomer.phone;
    $account('#registerForm').hidden = true;
    $account('#loginForm').hidden = true;
    $account('#logoutButton').hidden = false;
  } else {
    $account('#accountOpen').textContent = 'عضویت / ورود';
    welcome.hidden = true;
    $account('#registerForm').hidden = false;
    $account('#loginForm').hidden = false;
    $account('#logoutButton').hidden = true;
  }
}
async function refreshCustomer() {
  try { const response = await fetch('/api/auth/me'); const data = await response.json(); currentCustomer = data.customer || null; }
  catch { currentCustomer = null; }
  showAccountState();
  document.dispatchEvent(new CustomEvent('avelora:auth-changed'));
}
$account('#accountOpen').addEventListener('click', () => $account('#accountDialog').showModal());
$account('#accountClose').addEventListener('click', () => $account('#accountDialog').close());
$account('#accountDialog').addEventListener('click', event => { if (event.target === $account('#accountDialog')) $account('#accountDialog').close(); });
async function submitAccount(form, action) {
  const body = Object.fromEntries(new FormData(form).entries());
  accountMessage('در حال بررسی اطلاعات...');
  const buttons = form.querySelectorAll('button');
  buttons.forEach(button => button.disabled = true);
  try {
    const response = await fetch('/api/auth/' + action, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'عملیات انجام نشد.');
    currentCustomer = data.customer || null;
    showAccountState();
    accountMessage(action === 'register' ? 'عضویت با موفقیت انجام شد.' : 'با موفقیت وارد حساب شدی.');
    form.reset();
    document.dispatchEvent(new CustomEvent('avelora:auth-changed'));
    setTimeout(() => $account('#accountDialog').close(), 900);
  } catch (error) { accountMessage(error.message); }
  finally { buttons.forEach(button => button.disabled = false); }
}
$account('#registerForm').addEventListener('submit', event => { event.preventDefault(); submitAccount(event.currentTarget, 'register'); });
$account('#loginForm').addEventListener('submit', event => { event.preventDefault(); submitAccount(event.currentTarget, 'login'); });
$account('#logoutButton').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method:'POST' }); } catch {}
  currentCustomer = null;
  showAccountState();
  accountMessage('از حساب خارج شدی.');
  document.dispatchEvent(new CustomEvent('avelora:auth-changed'));
});
refreshCustomer();
