/*
 * i18n module — internationalization for Nidaa.
 *
 * Uses gettext with compiled .mo files for system-locale translations,
 * with a JSON-based fallback for the per-extension language override.
 *
 * GNOME 45+ pattern: Extension.gettext() for code inside the Extension
 * class, and this module for standalone UI code (preferences, popup).
 *
 * Supported locales: en (default/fallback), ar (Arabic), fr (French).
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const LOG_PREFIX = '[Nidaa:i18n]';

const DOMAIN = 'nidaa';
let _initialized = false;
let _gettextFn = null;
let _overrideLang = null;

/**
 * Translation dictionaries keyed by language code.
 * Populated at setup time from bundled JSON files.
 */
const _dicts = {};

// ── Bundled English strings (identity / source of truth) ──────────────
const EN = {
  // Indicator
  'Resolving location…': 'Resolving location…',
  'Nidaa': 'Nidaa',

  // Prayer names
  'Fajr': 'Fajr',
  'Sunrise': 'Sunrise',
  'Dhuhr': 'Dhuhr',
  'Asr': 'Asr',
  'Maghrib': 'Maghrib',
  'Isha': 'Isha',
  'Suhoor': 'Suhoor',
  'Iftar': 'Iftar',

  // Countdown
  'in': 'in',
  'min': 'min',
  'now': 'now',
  'h': 'h',

  // Popup
  'Waiting for location…': 'Waiting for location…',

  // Preferences pages
  'Prayer': 'Prayer',
  'Location': 'Location',
  'Adhkar': 'Adhkar',
  'Quran': 'Quran',
  'Islamic Events': 'Islamic Events',
  'General': 'General',
  'Settings': 'Settings',

  // Prayer page
  'Calculation Method': 'Calculation Method',
  'Choose the method used to calculate prayer times.': 'Choose the method used to calculate prayer times.',
  'Method': 'Method',
  'Different organizations use slightly different twilight angles.': 'Different organizations use slightly different twilight angles.',
  'Muslim World League (MWL)': 'Muslim World League (MWL)',
  'Islamic Society of North America (ISNA)': 'Islamic Society of North America (ISNA)',
  'Egyptian General Authority of Survey': 'Egyptian General Authority of Survey',
  'Umm Al-Qura University (Makkah)': 'Umm Al-Qura University (Makkah)',
  'University of Islamic Sciences, Karachi': 'University of Islamic Sciences, Karachi',
  'Institute of Geophysics, University of Tehran': 'Institute of Geophysics, University of Tehran',
  'Leva Research Institute (Qom) / Shia Ithna Ashari': 'Leva Research Institute (Qom) / Shia Ithna Ashari',
  'Custom (user-supplied angles)': 'Custom (user-supplied angles)',
  'Custom Angles': 'Custom Angles',
  'Set your own Fajr and Isha twilight angles.': 'Set your own Fajr and Isha twilight angles.',
  'Fajr angle (°)': 'Fajr angle (°)',
  'Isha angle (°)': 'Isha angle (°)',
  'Madhab': 'Madhab',
  'Determines how Asr prayer time is calculated.': 'Determines how Asr prayer time is calculated.',
  'Asr Calculation': 'Asr Calculation',
  'Shafii uses shadow length = object height; Hanafi uses double.': 'Shafii uses shadow length = object height; Hanafi uses double.',
  'Shafii (standard)': 'Shafii (standard)',
  'Hanafi': 'Hanafi',
  'High Latitude Rule': 'High Latitude Rule',
  'For locations above ~48° latitude where twilight persists.': 'For locations above ~48° latitude where twilight persists.',
  'Night Method': 'Night Method',
  'How to determine Fajr/Isha when the sun barely sets.': 'How to determine Fajr/Isha when the sun barely sets.',
  'None': 'None',
  'Angle-Based (recommended)': 'Angle-Based (recommended)',
  'Middle of Night': 'Middle of Night',
  'One-Seventh of Night': 'One-Seventh of Night',
  'Time Adjustments': 'Time Adjustments',
  'Fine-tune individual prayer times if your local mosque differs slightly.': 'Fine-tune individual prayer times if your local mosque differs slightly.',
  'Minutes (positive = later, negative = earlier)': 'Minutes (positive = later, negative = earlier)',
  'Fajr Offset': 'Fajr Offset',
  'Dhuhr Offset': 'Dhuhr Offset',
  'Asr Offset': 'Asr Offset',
  'Maghrib Offset': 'Maghrib Offset',
  'Isha Offset': 'Isha Offset',

  // Location page
  'Current Location': 'Current Location',
  'Resolving location...': 'Resolving location...',
  'Waiting for first fix.': 'Waiting for first fix.',
  'Location Source': 'Location Source',
  'How Nidaa determines your position for prayer times.': 'How Nidaa determines your position for prayer times.',
  'Location Mode': 'Location Mode',
  'Automatic uses Geoclue with IP fallback.': 'Automatic uses Geoclue with IP fallback.',
  'Automatic (Geoclue + IP)': 'Automatic (Geoclue + IP)',
  'Search city': 'Search city',
  'Enter coordinates manually': 'Enter coordinates manually',
  'Manual Coordinates': 'Manual Coordinates',
  'Enter latitude and longitude in decimal degrees.': 'Enter latitude and longitude in decimal degrees.',
  'Latitude': 'Latitude',
  'North is positive, South is negative (-90 to 90).': 'North is positive, South is negative (-90 to 90).',
  'Longitude': 'Longitude',
  'East is positive, West is negative (-180 to 180).': 'East is positive, West is negative (-180 to 180).',
  'City Search': 'City Search',
  'Select a city from the bundled database (offline).': 'Select a city from the bundled database (offline).',
  'Search cities...': 'Search cities...',
  'No location set': 'No location set',
  'Enter coordinates or select a city.': 'Enter coordinates or select a city.',
  'Automatic': 'Automatic',
  'Using Geoclue with IP fallback. Location is resolved at startup.': 'Using Geoclue with IP fallback. Location is resolved at startup.',
  'Mode: Manual entry': 'Mode: Manual entry',

  // Adhkar page
  'Enable Adhkar': 'Enable Adhkar',
  'Show reminders for morning, evening, and post-prayer adhkar.': 'Show reminders for morning, evening, and post-prayer adhkar.',
  'Language': 'Language',
  'Choose the language for adhkar text.': 'Choose the language for adhkar text.',
  'Arabic': 'Arabic',
  'English': 'English',
  'French': 'French',
  'Timing': 'Timing',
  'Adjust when adhkar notifications are sent relative to prayer times.': 'Adjust when adhkar notifications are sent relative to prayer times.',
  'Morning Adhkar Offset': 'Morning Adhkar Offset',
  'Minutes after sunrise to send the reminder.': 'Minutes after sunrise to send the reminder.',
  'Evening Adhkar Offset': 'Evening Adhkar Offset',
  'Minutes before Maghrib to send the reminder.': 'Minutes before Maghrib to send the reminder.',
  'Post-Prayer Offset': 'Post-Prayer Offset',
  'Minutes after the Iqamah reminder to send the post-prayer adhkar.': 'Minutes after the Iqamah reminder to send the post-prayer adhkar.',
  'Per-Prayer Adhkar': 'Per-Prayer Adhkar',
  'Choose which prayers trigger a post-prayer adhkar reminder.': 'Choose which prayers trigger a post-prayer adhkar reminder.',
  'After Fajr': 'After Fajr',
  'After Dhuhr': 'After Dhuhr',
  'After Asr': 'After Asr',
  'After Maghrib': 'After Maghrib',
  'After Isha': 'After Isha',
  'Show adhkar reminder after Fajr prayer.': 'Show adhkar reminder after Fajr prayer.',
  'Show adhkar reminder after Dhuhr prayer.': 'Show adhkar reminder after Dhuhr prayer.',
  'Show adhkar reminder after Asr prayer.': 'Show adhkar reminder after Asr prayer.',
  'Show adhkar reminder after Maghrib prayer.': 'Show adhkar reminder after Maghrib prayer.',
  'Show adhkar reminder after Isha prayer.': 'Show adhkar reminder after Isha prayer.',

  // Quran page
  'Reading Reminder': 'Reading Reminder',
  'Configure how often you receive Quran reading reminders.': 'Configure how often you receive Quran reading reminders.',
  'Enable Quran Reminders': 'Enable Quran Reminders',
  'Show periodic reminders to read Quran.': 'Show periodic reminders to read Quran.',
  'Reminder Frequency': 'Reminder Frequency',
  'How often to send the Quran reading reminder.': 'How often to send the Quran reading reminder.',
  'Daily': 'Daily',
  'Weekly (Fridays)': 'Weekly (Fridays)',
  'After Fajr': 'After Fajr',
  'After Isha': 'After Isha',
  'Every 6 Hours': 'Every 6 Hours',
  'Random Time': 'Random Time',
  'Offset After Prayer': 'Offset After Prayer',
  'Minutes after the prayer to send the reminder.': 'Minutes after the prayer to send the reminder.',
  'Window Start Hour': 'Window Start Hour',
  'Earliest hour for the random reminder (0–23).': 'Earliest hour for the random reminder (0–23).',
  'Window End Hour': 'Window End Hour',
  'Latest hour for the random reminder (1–24).': 'Latest hour for the random reminder (1–24).',
  'Daily Goal': 'Daily Goal',
  'Set a target number of pages to read each day.': 'Set a target number of pages to read each day.',
  'Pages per Day': 'Pages per Day',
  'Your daily Quran reading goal.': 'Your daily Quran reading goal.',

  // Adhkar detail
  'Close': 'Close',
  'Repeat': 'Repeat',
  'Reference': 'Reference',

  // Notifications
  'Open Adhkar': 'Open Adhkar',

  // Settings
  'Import Settings': 'Import Settings',
  'Export Settings': 'Export Settings',
  'Import extension settings from a JSON file.': 'Import extension settings from a JSON file.',
  'Export extension settings to a JSON file.': 'Export extension settings to a JSON file.',
  'Settings exported successfully': 'Settings exported successfully',
  'Settings imported successfully': 'Settings imported successfully',
  'Invalid settings file': 'Invalid settings file',
  'The file does not match the expected format.': 'The file does not match the expected format.',
  'Override': 'Override',
  'Override system locale for Nidaa UI strings.': 'Override system locale for Nidaa UI strings.',

  // Islamic Events
  'Enable Friday Reminders': 'Enable Friday Reminders',
  'Notifications for Thursday night, Friday morning, and Friday afternoon.': 'Notifications for Thursday night, Friday morning, and Friday afternoon.',
  'Enable Ashura Reminder': 'Enable Ashura Reminder',
  'Reminder on Muharram 10 (Ashura).': 'Reminder on Muharram 10 (Ashura).',
  'Ashura Day-Before': 'Ashura Day-Before',
  'Show a heads-up the day before Ashura.': 'Show a heads-up the day before Ashura.',
  'Enable Arafah Reminder': 'Enable Arafah Reminder',
  'Reminder on Dhul Hijjah 9 (Day of Arafah).': 'Reminder on Dhul Hijjah 9 (Day of Arafah).',
  'Arafah Day-Before': 'Arafah Day-Before',
  'Show a heads-up the day before Arafah.': 'Show a heads-up the day before Arafah.',
  'Enable White Days': 'Enable White Days',
  'Reminder on the 13th–15th of each Hijri month.': 'Reminder on the 13th–15th of each Hijri month.',
  'Friday Times': 'Friday Times',
  'Configure when the three Friday reminders are sent.': 'Configure when the three Friday reminders are sent.',
  'Thursday Night Time': 'Thursday Night Time',
  'Hour of the Thursday night reminder (0–23).': 'Hour of the Thursday night reminder (0–23).',
  'Friday Morning Time': 'Friday Morning Time',
  'Hour of the Friday morning reminder (0–23).': 'Hour of the Friday morning reminder (0–23).',
  'Friday Afternoon Time': 'Friday Afternoon Time',
  'Hour of the Friday afternoon reminder (0–23).': 'Hour of the Friday afternoon reminder (0–23).',

  // Ramadan
  'Ramadan Mode': 'Ramadan Mode',
  'Active when Hijri month is Ramadan (9).': 'Active when Hijri month is Ramadan (9).',
  'Force Ramadan Mode': 'Force Ramadan Mode',
  'Override for testing — forces Ramadan display even when not month 9.': 'Override for testing — forces Ramadan display even when not month 9.',
  'Enable Taraweeh Reminder': 'Enable Taraweeh Reminder',
  'Reminder after Isha during Ramadan.': 'Reminder after Isha during Ramadan.',
  'Taraweeh Offset (min)': 'Taraweeh Offset (min)',
  'Minutes after Isha to send the Taraweeh reminder.': 'Minutes after Isha to send the Taraweeh reminder.',
  'Enable Laylat al-Qadr': 'Enable Laylat al-Qadr',
  'Special reminder on the odd nights of the last ten days of Ramadan.': 'Special reminder on the odd nights of the last ten days of Ramadan.',
  'Daily Ramadan Dua': 'Daily Ramadan Dua',
  'Show a daily dua during Ramadan.': 'Show a daily dua during Ramadan.',
};

// ── Arabic translations ──────────────────────────────────────────────
const AR = {
  'Resolving location…': 'جارٍ تحديد الموقع…',
  'Nidaa': 'نِداء',
  'Fajr': 'الفجر',
  'Sunrise': 'الشروق',
  'Dhuhr': 'الظهر',
  'Asr': 'العصر',
  'Maghrib': 'المغرب',
  'Isha': 'العشاء',
  'Suhoor': 'السحور',
  'Iftar': 'الإفطار',
  'in': 'بعد',
  'min': 'د',
  'now': 'الآن',
  'h': 'س',
  'Waiting for location…': 'بانتظار الموقع…',
  'Prayer': 'أوقات الصلاة',
  'Location': 'الموقع',
  'Adhkar': 'الأذكار',
  'Quran': 'القرآن',
  'Islamic Events': 'الأحداث الإسلامية',
  'General': 'عام',
  'Settings': 'الإعدادات',
  'Calculation Method': 'طريقة الحساب',
  'Choose the method used to calculate prayer times.': 'اختر الطريقة المستخدمة لحساب أوقات الصلاة.',
  'Method': 'الطريقة',
  'Different organizations use slightly different twilight angles.': 'تستخدم المنظمات المختلفة زوايا غروب مختلفة قليلاً.',
  'Muslim World League (MWL)': 'رابطة العالم الإسلامي (MWL)',
  'Islamic Society of North America (ISNA)': 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)',
  'Egyptian General Authority of Survey': 'الهيئة المصرية العامة للمساحة',
  'Umm Al-Qura University (Makkah)': 'جامعة أم القرى (مكة المكرمة)',
  'University of Islamic Sciences, Karachi': 'جامعة العلوم الإسلامية (كراتشي)',
  'Institute of Geophysics, University of Tehran': 'معهد الجيوفيزياء (جامعة طهران)',
  'Leva Research Institute (Qom) / Shia Ithna Ashari': 'معهد ليفا للبحوث (قم) / الشيعة الاثنا عشرية',
  'Custom (user-supplied angles)': 'مخصص (زوايا المستخدم)',
  'Custom Angles': 'زوايا مخصصة',
  'Set your own Fajr and Isha twilight angles.': 'حدد زوايا الشفق الخاصة بك للفجر والعشاء.',
  'Fajr angle (°)': 'زاوية الفجر (°)',
  'Isha angle (°)': 'زاوية العشاء (°)',
  'Madhab': 'المذهب',
  'Determines how Asr prayer time is calculated.': 'يحدد كيفية حساب وقت صلاة العصر.',
  'Asr Calculation': 'حساب العصر',
  'Shafii uses shadow length = object height; Hanafi uses double.': 'الشافعي: طول الظل = ارتفاع الجسم. الحنفي: ضعف الظل.',
  'Shafii (standard)': 'شافعي (قياسي)',
  'Hanafi': 'حنفي',
  'High Latitude Rule': 'قاعدة العرض العالي',
  'For locations above ~48° latitude where twilight persists.': 'للمناطق التي تتجاوز خط عرضها 48° حيث يستمر الشفق.',
  'Night Method': 'طريقة الليل',
  'How to determine Fajr/Isha when the sun barely sets.': 'كيفية تحديد الفجر/العشاء عندما يكاد الغروب لا يتلاشى.',
  'None': 'بدون',
  'Angle-Based (recommended)': 'قائم على الزاوية (موصى به)',
  'Middle of Night': 'منتصف الليل',
  'One-Seventh of Night': 'سبع الليل',
  'Time Adjustments': 'تعديلات الوقت',
  'Fine-tune individual prayer times if your local mosque differs slightly.': 'اضبط أوقات الصلاة إذا كان مسجدك المحلي يختلف قليلاً.',
  'Minutes (positive = later, negative = earlier)': 'الدقائق (موجب = أ晚، سالب = أبكر)',
  'Fajr Offset': 'تعديل الفجر',
  'Dhuhr Offset': 'تعديل الظهر',
  'Asr Offset': 'تعديل العصر',
  'Maghrib Offset': 'تعديل المغرب',
  'Isha Offset': 'تعديل العشاء',
  'Current Location': 'الموقع الحالي',
  'Resolving location...': 'جارٍ تحديد الموقع...',
  'Waiting for first fix.': 'بانتظار الإحداثيات الأولى.',
  'Location Source': 'مصدر الموقع',
  'How Nidaa determines your position for prayer times.': 'كيف يحدد نِداء موقعك لأوقات الصلاة.',
  'Location Mode': 'وضع الموقع',
  'Automatic uses Geoclue with IP fallback.': 'التلقائي يستخدم Geoclue مع البديل عبر IP.',
  'Automatic (Geoclue + IP)': 'تلقائي (Geoclue + IP)',
  'Search city': 'البحث عن مدينة',
  'Enter coordinates manually': 'إدخال الإحداثيات يدوياً',
  'Manual Coordinates': 'إحداثيات يدوية',
  'Enter latitude and longitude in decimal degrees.': 'أدخل خط العرض والطول بالدرجات العشرية.',
  'Latitude': 'خط العرض',
  'North is positive, South is negative (-90 to 90).': 'الشمال موجب، الجنوب سالب (-90 إلى 90).',
  'Longitude': 'خط الطول',
  'East is positive, West is negative (-180 to 180).': 'الشرق موجب، الغرب سالب (-180 إلى 180).',
  'City Search': 'البحث عن مدينة',
  'Select a city from the bundled database (offline).': 'اختر مدينة من قاعدة البيانات المدمجة (دون اتصال).',
  'Search cities...': 'البحث عن مدن...',
  'No location set': 'لم يتم تعيين موقع',
  'Enter coordinates or select a city.': 'أدخل الإحداثيات أو اختر مدينة.',
  'Automatic': 'تلقائي',
  'Using Geoclue with IP fallback. Location is resolved at startup.': 'يستخدم Geoclue مع البديل عبر IP. يتم تحديد الموقع عند بدء التشغيل.',
  'Enable Adhkar': 'تفعيل الأذكار',
  'Show reminders for morning, evening, and post-prayer adhkar.': 'عرض تذكيرات لأذكار الصباح والمساء وما بعد الصلاة.',
  'Language': 'اللغة',
  'Choose the language for adhkar text.': 'اختر لغة نصوص الأذكار.',
  'Arabic': 'العربية',
  'English': 'الإنجليزية',
  'French': 'الفرنسية',
  'Timing': 'التوقيت',
  'Adjust when adhkar notifications are sent relative to prayer times.': 'اضبط متى يتم إرسال إشعارات الأذكار بالنسبة لأوقات الصلاة.',
  'Morning Adhkar Offset': 'تأخير أذكار الصباح',
  'Minutes after sunrise to send the reminder.': 'الدقائق بعد شروق الشمس لإرسال التذكير.',
  'Evening Adhkar Offset': 'تأخير أذكار المساء',
  'Minutes before Maghrib to send the reminder.': 'الدقائق قبل المغرب لإرسال التذكير.',
  'Post-Prayer Offset': 'تأخير ما بعد الصلاة',
  'Minutes after the Iqamah reminder to send the post-prayer adhkar.': 'الدقائق بعد تذكير الإقامة لإرسال أذكار ما بعد الصلاة.',
  'Per-Prayer Adhkar': 'أذكار كل صلاة',
  'Choose which prayers trigger a post-prayer adhkar reminder.': 'اختر أي صلاة تُفعّل تذكير أذكار ما بعدها.',
  'After Fajr': 'بعد الفجر',
  'After Dhuhr': 'بعد الظهر',
  'After Asr': 'بعد العصر',
  'After Maghrib': 'بعد المغرب',
  'After Isha': 'بعد العشاء',
  'Reading Reminder': 'تذكير القراءة',
  'Configure how often you receive Quran reading reminders.': 'قم بتكوين عدد مرات تلقي تذكيرات قراءة القرآن.',
  'Enable Quran Reminders': 'تفعيل تذكيرات القرآن',
  'Show periodic reminders to read Quran.': 'عرض تذكيرات دورية لقراءة القرآن.',
  'Reminder Frequency': 'تكرار التذكير',
  'How often to send the Quran reading reminder.': 'كم مرة يتم إرسال تذكير قراءة القرآن.',
  'Daily': 'يومياً',
  'Weekly (Fridays)': 'أسبوعياً (الجمعة)',
  'Every 6 Hours': 'كل 6 ساعات',
  'Random Time': 'وقت عشوائي',
  'Offset After Prayer': 'التأخير بعد الصلاة',
  'Minutes after the prayer to send the reminder.': 'الدقائق بعد الصلاة لإرسال التذكير.',
  'Window Start Hour': 'ساعة البداية',
  'Earliest hour for the random reminder (0–23).': 'أبكر ساعة للتذكير العشوائي (0–23).',
  'Window End Hour': 'ساعة النهاية',
  'Latest hour for the random reminder (1–24).': 'آخر ساعة للتذكير العشوائي (1–24).',
  'Daily Goal': 'الهدف اليومي',
  'Set a target number of pages to read each day.': 'حدد عدد الصفحات المستهدفة للقراءة يومياً.',
  'Pages per Day': 'صفحات يومياً',
  'Your daily Quran reading goal.': 'هدفك اليومي لقراءة القرآن.',
  'Close': 'إغلاق',
  'Repeat': 'التكرار',
  'Reference': 'المصدر',
  'Open Adhkar': 'فتح الأذكار',
  'Import Settings': 'استيراد الإعدادات',
  'Export Settings': 'تصدير الإعدادات',
  'Import extension settings from a JSON file.': 'استيراد إعدادات الامتداد من ملف JSON.',
  'Export extension settings to a JSON file.': 'تصدير إعدادات الامتداد إلى ملف JSON.',
  'Settings exported successfully': 'تم تصدير الإعدادات بنجاح',
  'Settings imported successfully': 'تم استيراد الإعدادات بنجاح',
  'Invalid settings file': 'ملف إعدادات غير صالح',
  'The file does not match the expected format.': 'الملف لا يتطابق مع التنسيق المتوقع.',
  'Override': 'تجاوز',
  'Override system locale for Nidaa UI strings.': 'تجاوز اللغة النظامية لنصوص واجهة نِداء.',
  'Enable Friday Reminders': 'تفعيل تذكيرات الجمعة',
  'Notifications for Thursday night, Friday morning, and Friday afternoon.': 'إشعارات ليلة الخميس وصباح الجمعة وعصر الجمعة.',
  'Enable Ashura Reminder': 'تفعيل تذكير عاشوراء',
  'Reminder on Muharram 10 (Ashura).': 'تذكير في محرم 10 (عاشوراء).',
  'Ashura Day-Before': 'اليوم السابق لعاشوراء',
  'Show a heads-up the day before Ashura.': 'عرض تنبيه قبل يوم من عاشوراء.',
  'Enable Arafah Reminder': 'تفعيل تذكير عرفة',
  'Reminder on Dhul Hijjah 9 (Day of Arafah).': 'تذكير في ذي الحجة 9 (يوم عرفة).',
  'Arafah Day-Before': 'اليوم السابق لعرفة',
  'Show a heads-up the day before Arafah.': 'عرض تنبيه قبل يوم من عرفة.',
  'Enable White Days': 'تفعيل الأيام البيض',
  'Reminder on the 13th–15th of each Hijri month.': 'تذكير في 13-15 من كل شهر هجري.',
  'Friday Times': 'أوقات الجمعة',
  'Configure when the three Friday reminders are sent.': 'قم بتكوين وقت إرسال تذكيرات الجمعة الثلاثة.',
  'Thursday Night Time': 'وقت ليلة الخميس',
  'Hour of the Thursday night reminder (0–23).': 'ساعة تذكير ليلة الخميس (0–23).',
  'Friday Morning Time': 'وقت صباح الجمعة',
  'Hour of the Friday morning reminder (0–23).': 'ساعة تذكير صباح الجمعة (0–23).',
  'Friday Afternoon Time': 'وقت عصر الجمعة',
  'Hour of the Friday afternoon reminder (0–23).': 'ساعة تذكير عصر الجمعة (0–23).',
  'Ramadan Mode': 'وضع رمضان',
  'Active when Hijri month is Ramadan (9).': 'نشط عندما يكون الشهر الهجري هو رمضان (9).',
  'Force Ramadan Mode': 'فرض وضع رمضان',
  'Override for testing — forces Ramadan display even when not month 9.': 'تجاوز للاختبار — يفرض عرض رمضان حتى لو لم يكن الشهر 9.',
  'Enable Taraweeh Reminder': 'تفعيل تذكير التراويح',
  'Reminder after Isha during Ramadan.': 'تذكير بعد العشاء خلال رمضان.',
  'Taraweeh Offset (min)': 'تأخير التراويح (د)',
  'Minutes after Isha to send the Taraweeh reminder.': 'الدقائق بعد العشاء لإرسال تذكير التراويح.',
  'Enable Laylat al-Qadr': 'تفعيل ليلة القدر',
  'Special reminder on the odd nights of the last ten days of Ramadan.': 'تذكير خاص في الليالي الوترية من آخر عشر ليالي من رمضان.',
  'Daily Ramadan Dua': 'دعاء يومي في رمضان',
  'Show a daily dua during Ramadan.': 'عرض دعاء يومي خلال رمضان.',
  'pages': 'صفحات',
  'Pages': 'صفحات',
  '+1 Page': '+1 صفحة',
  "Today's Goal": 'الهدف اليومي',
};

// ── French translations ──────────────────────────────────────────────
const FR = {
  'Resolving location…': 'Localisation en cours…',
  'Nidaa': 'Nidaa',
  'Fajr': 'Fajr',
  'Sunrise': 'Lever du soleil',
  'Dhuhr': 'Dhuhr',
  'Asr': 'Asr',
  'Maghrib': 'Maghrib',
  'Isha': 'Isha',
  'Suhoor': 'Suhur',
  'Iftar': 'Iftar',
  'in': 'dans',
  'min': 'min',
  'now': 'maintenant',
  'h': 'h',
  'Waiting for location…': 'En attente de la localisation…',
  'Prayer': 'Prières',
  'Location': 'Localisation',
  'Adhkar': 'Adhkar',
  'Quran': 'Coran',
  'Islamic Events': 'Événements islamiques',
  'General': 'Général',
  'Settings': 'Paramètres',
  'Calculation Method': 'Méthode de calcul',
  'Choose the method used to calculate prayer times.': 'Choisissez la méthode utilisée pour calculer les heures de prière.',
  'Method': 'Méthode',
  'Different organizations use slightly different twilight angles.': 'Les organisations utilisent des angles de crépuscule légèrement différents.',
  'Muslim World League (MWL)': 'Ligue Islamique Mondiale (MWL)',
  'Islamic Society of North America (ISNA)': 'Société Islamique d\'Amérique du Nord (ISNA)',
  'Egyptian General Authority of Survey': 'Autorité Générale Égyptienne des domaines',
  'Umm Al-Qura University (Makkah)': 'Université Oumm Al-Qoura (La Mecque)',
  'University of Islamic Sciences, Karachi': 'Université des Sciences Islamiques (Karachi)',
  'Institute of Geophysics, University of Tehran': 'Institut de Géophysique (Université de Téhéran)',
  'Leva Research Institute (Qom) / Shia Ithna Ashari': 'Institut de Recherche Leva (Qom) / Chiite duodécimain',
  'Custom (user-supplied angles)': 'Personnalisé (angles de l\'utilisateur)',
  'Custom Angles': 'Angles personnalisés',
  'Set your own Fajr and Isha twilight angles.': 'Définissez vos propres angles de crépuscule pour Fajr et Isha.',
  'Fajr angle (°)': 'Angle Fajr (°)',
  'Isha angle (°)': 'Angle Isha (°)',
  'Madhab': 'Madhab',
  'Determines how Asr prayer time is calculated.': 'Détermine comment l\'heure de la prière d\'Asr est calculée.',
  'Asr Calculation': 'Calcul d\'Asr',
  'Shafii uses shadow length = object height; Hanafi uses double.': 'Shafafi : longueur de l\'ombre = hauteur de l\'objet. Hanafi : double.',
  'Shafii (standard)': 'Shafafi (standard)',
  'Hanafi': 'Hanafi',
  'High Latitude Rule': 'Règle des hautes latitudes',
  'For locations above ~48° latitude where twilight persists.': 'Pour les localisations au-dessus de ~48° de latitude où le crépuscule persiste.',
  'Night Method': 'Méthode nocturne',
  'How to determine Fajr/Isha when the sun barely sets.': 'Comment déterminer Fajr/Isha quand le soleil se couche à peine.',
  'None': 'Aucun',
  'Angle-Based (recommended)': 'Basé sur l\'angle (recommandé)',
  'Middle of Night': 'Milieu de la nuit',
  'One-Seventh of Night': 'Un septième de la nuit',
  'Time Adjustments': 'Ajustements horaires',
  'Fine-tune individual prayer times if your local mosque differs slightly.': 'Ajustez les heures de prière si votre mosquée locale diffère légèrement.',
  'Minutes (positive = later, negative = earlier)': 'Minutes (positif = plus tard, négatif = plus tôt)',
  'Fajr Offset': 'Décalage Fajr',
  'Dhuhr Offset': 'Décalage Dhuhr',
  'Asr Offset': 'Décalage Asr',
  'Maghrib Offset': 'Décalage Maghrib',
  'Isha Offset': 'Décalage Isha',
  'Current Location': 'Localisation actuelle',
  'Resolving location...': 'Localisation en cours...',
  'Waiting for first fix.': 'En attente de la première fixation.',
  'Location Source': 'Source de localisation',
  'How Nidaa determines your position for prayer times.': 'Comment Nidaa détermine votre position pour les heures de prière.',
  'Location Mode': 'Mode de localisation',
  'Automatic uses Geoclue with IP fallback.': 'Automatique utilise Geoclue avec secours IP.',
  'Automatic (Geoclue + IP)': 'Automatique (Geoclue + IP)',
  'Search city': 'Rechercher une ville',
  'Enter coordinates manually': 'Saisir les coordonnées manuellement',
  'Manual Coordinates': 'Coordonnées manuelles',
  'Enter latitude and longitude in decimal degrees.': 'Saisissez la latitude et la longitude en degrés décimaux.',
  'Latitude': 'Latitude',
  'North is positive, South is negative (-90 to 90).': 'Nord est positif, Sud est négatif (-90 à 90).',
  'Longitude': 'Longitude',
  'East is positive, West is negative (-180 to 180).': 'Est est positif, Ouest est négatif (-180 à 180).',
  'City Search': 'Recherche de ville',
  'Select a city from the bundled database (offline).': 'Sélectionnez une ville dans la base de données intégrée (hors ligne).',
  'Search cities...': 'Rechercher des villes...',
  'No location set': 'Aucune localisation définie',
  'Enter coordinates or select a city.': 'Saisissez les coordonnées ou sélectionnez une ville.',
  'Automatic': 'Automatique',
  'Using Geoclue with IP fallback. Location is resolved at startup.': 'Utilise Geoclue avec secours IP. La localisation est résolue au démarrage.',
  'Enable Adhkar': 'Activer les Adhkar',
  'Show reminders for morning, evening, and post-prayer adhkar.': 'Afficher les rappels pour les adhkar du matin, du soir et après la prière.',
  'Language': 'Langue',
  'Choose the language for adhkar text.': 'Choisissez la langue du texte des adhkar.',
  'Arabic': 'Arabe',
  'English': 'Anglais',
  'French': 'Français',
  'Timing': 'Horaires',
  'Adjust when adhkar notifications are sent relative to prayer times.': 'Ajustez quand les notifications d\'adhkar sont envoyées par rapport aux heures de prière.',
  'Morning Adhkar Offset': 'Décalage adhkar du matin',
  'Minutes after sunrise to send the reminder.': 'Minutes après le lever du soleil pour envoyer le rappel.',
  'Evening Adhkar Offset': 'Décalage adhkar du soir',
  'Minutes before Maghrib to send the reminder.': 'Minutes avant Maghrib pour envoyer le rappel.',
  'Post-Prayer Offset': 'Décalage après la prière',
  'Minutes after the Iqamah reminder to send the post-prayer adhkar.': 'Minutes après le rappel d\'Iqamah pour envoyer les adhkar après la prière.',
  'Per-Prayer Adhkar': 'Adhkar par prière',
  'Choose which prayers trigger a post-prayer adhkar reminder.': 'Choisissez quelles prières déclenchent un rappel d\'adhkar.',
  'After Fajr': 'Après Fajr',
  'After Dhuhr': 'Après Dhuhr',
  'After Asr': 'Après Asr',
  'After Maghrib': 'Après Maghrib',
  'After Isha': 'Après Isha',
  'Reading Reminder': 'Rappel de lecture',
  'Configure how often you receive Quran reading reminders.': 'Configurez la fréquence des rappels de lecture du Coran.',
  'Enable Quran Reminders': 'Activer les rappels Coran',
  'Show periodic reminders to read Quran.': 'Afficher des rappels périodiques pour lire le Coran.',
  'Reminder Frequency': 'Fréquence des rappels',
  'How often to send the Quran reading reminder.': 'Fréquence d\'envoi du rappel de lecture du Coran.',
  'Daily': 'Quotidien',
  'Weekly (Fridays)': 'Hebdomadaire (vendredis)',
  'Every 6 Hours': 'Toutes les 6 heures',
  'Random Time': 'Heure aléatoire',
  'Offset After Prayer': 'Décalage après la prière',
  'Minutes after the prayer to send the reminder.': 'Minutes après la prière pour envoyer le rappel.',
  'Window Start Hour': 'Heure de début',
  'Earliest hour for the random reminder (0–23).': 'Heure la plus précoce pour le rappel aléatoire (0–23).',
  'Window End Hour': 'Heure de fin',
  'Latest hour for the random reminder (1–24).': 'Heure la plus tardive pour le rappel aléatoire (1–24).',
  'Daily Goal': 'Objectif quotidien',
  'Set a target number of pages to read each day.': 'Définissez un nombre cible de pages à lire chaque jour.',
  'Pages per Day': 'Pages par jour',
  'Your daily Quran reading goal.': 'Votre objectif quotidien de lecture du Coran.',
  'Close': 'Fermer',
  'Repeat': 'Répétition',
  'Reference': 'Référence',
  'Open Adhkar': 'Ouvrir les Adhkar',
  'Import Settings': 'Importer les paramètres',
  'Export Settings': 'Exporter les paramètres',
  'Import extension settings from a JSON file.': 'Importer les paramètres de l\'extension depuis un fichier JSON.',
  'Export extension settings to a JSON file.': 'Exporter les paramètres de l\'extension vers un fichier JSON.',
  'Settings exported successfully': 'Paramètres exportés avec succès',
  'Settings imported successfully': 'Paramètres importés avec succès',
  'Invalid settings file': 'Fichier de paramètres invalide',
  'The file does not match the expected format.': 'Le fichier ne correspond pas au format attendu.',
  'Override': 'Remplacement',
  'Override system locale for Nidaa UI strings.': 'Remplacer la locale système pour les chaînes de l\'interface Nidaa.',
  'Enable Friday Reminders': 'Activer les rappels du vendredi',
  'Notifications for Thursday night, Friday morning, and Friday afternoon.': 'Notifications jeudi soir, vendredi matin et vendredi après-midi.',
  'Enable Ashura Reminder': 'Activer le rappel d\'Ashoura',
  'Reminder on Muharram 10 (Ashura).': 'Rappel le 10 Muharram (Ashoura).',
  'Ashura Day-Before': 'La veille d\'Ashoura',
  'Show a heads-up the day before Ashura.': 'Afficher un avertissement la veille d\'Ashoura.',
  'Enable Arafah Reminder': 'Activer le rappel d\'Arafah',
  'Reminder on Dhul Hijjah 9 (Day of Arafah).': 'Rappel le 9 Dhoul Hijja (Journée d\'Arafah).',
  'Arafah Day-Before': 'La veille d\'Arafah',
  'Show a heads-up the day before Arafah.': 'Afficher un avertissement la veille d\'Arafah.',
  'Enable White Days': 'Activer les Jours Blancs',
  'Reminder on the 13th–15th of each Hijri month.': 'Rappel les 13e–15e de chaque mois hégirien.',
  'Friday Times': 'Horaires du vendredi',
  'Configure when the three Friday reminders are sent.': 'Configurez quand les trois rappels du vendredi sont envoyés.',
  'Thursday Night Time': 'Heure du jeudi soir',
  'Hour of the Thursday night reminder (0–23).': 'Heure du rappel du jeudi soir (0–23).',
  'Friday Morning Time': 'Heure du vendredi matin',
  'Hour of the Friday morning reminder (0–23).': 'Heure du rappel du vendredi matin (0–23).',
  'Friday Afternoon Time': 'Heure du vendredi après-midi',
  'Hour of the Friday afternoon reminder (0–23).': 'Heure du rappel du vendredi après-midi (0–23).',
  'Ramadan Mode': 'Mode Ramadan',
  'Active when Hijri month is Ramadan (9).': 'Actif lorsque le mois hégirien est Ramadan (9).',
  'Force Ramadan Mode': 'Forcer le mode Ramadan',
  'Override for testing — forces Ramadan display even when not month 9.': 'Remplacement pour les tests — force l\'affichage Ramadan même si ce n\'est pas le mois 9.',
  'Enable Taraweeh Reminder': 'Activer le rappel de Tarawih',
  'Reminder after Isha during Ramadan.': 'Rappel après Isha pendant le Ramadan.',
  'Taraweeh Offset (min)': 'Décalage Tarawih (min)',
  'Minutes after Isha to send the Taraweeh reminder.': 'Minutes après Isha pour envoyer le rappel de Tarawih.',
  'Enable Laylat al-Qadr': 'Activer Laylat al-Qadr',
  'Special reminder on the odd nights of the last ten days of Ramadan.': 'Rappel spécial les nuits impaires des dix derniers nuits du Ramadan.',
  'Daily Ramadan Dua': 'Dua quotidien du Ramadan',
  'Show a daily dua during Ramadan.': 'Afficher un dua quotidien pendant le Ramadan.',
  'Pages': 'pages',
  '+1 Page': '+1 page',
  "Today's Goal": 'Objectif du jour',
};

/**
 * Initialize i18n. Call from extension.js enable().
 *
 * @param {string} extPath - Extension installation path
 */
export function setup(extPath) {
  if (_initialized) return;

  _dicts.en = EN;
  _dicts.ar = AR;
  _dicts.fr = FR;

  // Try to load gettext for system-locale translations
  try {
    const localeDir = GLib.build_filenamev([extPath, 'locale']);
    const dir = Gio.File.new_for_path(localeDir);
    if (dir.query_exists(null)) {
      imports.gettext.bindtextdomain(DOMAIN, localeDir);
      imports.gettext.textdomain(DOMAIN);
      _gettextFn = imports.gettext.gettext;
    }
  } catch (err) {
    // gettext not available, JSON dicts are the fallback
  }

  _initialized = true;
}

/**
 * Set the language override (from preferences).
 * Pass null or 'en' to clear.
 *
 * @param {string|null} lang - 'ar', 'fr', 'en', or null
 */
export function setLanguage(lang) {
  _overrideLang = lang && lang !== 'en' ? lang : null;
}

/**
 * Get the current active language.
 *
 * @returns {string} 'ar', 'fr', or 'en'
 */
export function getLanguage() {
  return _overrideLang || 'en';
}

/**
 * Translate a string.
 *
 * @param {string} str - English source string
 * @returns {string} Translated string
 */
export function _(str) {
  if (_overrideLang && _dicts[_overrideLang]) {
    return _dicts[_overrideLang][str] || str;
  }

  // Try gettext for system locale
  if (_gettextFn) {
    const translated = _gettextFn(str);
    if (translated && translated !== str) return translated;
  }

  return str;
}
