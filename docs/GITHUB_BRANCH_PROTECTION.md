# حفاظت شاخه main در GitHub

این مخزن باید فقط از طریق Pull Request به شاخه `main` تغییر کند. `CODEOWNERS` مالک مخزن را برای بازبینی تغییرات مشخص می‌کند؛ اما به‌تنهایی branch protection را فعال نمی‌کند.

## تنظیم پیشنهادی

در GitHub:
1. مخزن `johnrann-blip/Minimarkettiyam` را باز کنید.
2. وارد **Settings → Rules → Rulesets** شوید (یا Settings → Branches، بسته به رابط فعلی GitHub).
3. یک ruleset جدید برای شاخه‌ها بسازید و نامی مثل `protect-main` بدهید.
4. هدف را فقط شاخه `main` قرار دهید.
5. این قواعد را فعال کنید:
   - Require a pull request before merging.
   - Require status checks to pass before merging؛ بررسی `backend` را انتخاب کنید.
   - Block force pushes.
   - Restrict deletions.
6. اگر یک بازبین مستقل در دسترس است، الزام بازبینی CODEOWNERS را هم فعال کنید. در مخزن تک‌نفره، الزام یک تأیید جداگانه ممکن است ادغام را متوقف کند؛ آن را بدون بازبین مستقل فعال نکنید.
7. ruleset را فعال کنید (Enforcement status: Active) و ذخیره کنید.
8. بعد از ذخیره، دوباره Settings را باز کنید و مطمئن شوید قواعد روی `main` فعال هستند.

## آزمون پذیرش

- push مستقیم به `main` باید طبق قاعده رد شود.
- PR به `main` باید بررسی `backend` را الزام کند.
- وقتی CI قرمز است، ادغام باید مسدود شود.
- force-push و حذف `main` باید مسدود باشند.

وضعیت آخرین بررسی API مخزن در ۱۴۰۵/۰۸/۱۸: شاخه `main` محافظت‌شده نبود. اتصال GitHub موجود در این محیط فقط امکان خواندن تنظیمات حفاظت را دارد و مجوز نوشتن تنظیمات Repository Rules/Branch Protection را ندارد؛ بنابراین این تنظیم باید توسط مالک مخزن در رابط GitHub انجام و سپس دوباره بررسی شود.
