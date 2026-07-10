/**
 * HeadStart Event Operations - Email sender (Google Apps Script)
 *
 * Sends notification emails from YOUR school Gmail account.
 * No domain verification, no DNS records, no IT involvement needed.
 *
 * SETUP (5 minutes):
 * 1. Go to https://script.google.com while signed in with your school account.
 * 2. New project -> delete the sample code -> paste this whole file.
 * 3. Change SECRET below to your own long random text (keep it safe,
 *    you will enter the same value in Supabase as APPS_SCRIPT_SECRET).
 * 4. Click Deploy -> New deployment -> gear icon -> Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy, authorize the permissions, and copy the Web app URL.
 *    That URL goes into Supabase as APPS_SCRIPT_URL.
 *
 * Sending limits: about 1,500 emails/day on Google Workspace accounts,
 * 100/day on free Gmail. Either is far more than this system needs.
 */

var SECRET = 'Tassapolbn04';
var SENDER_NAME = 'HeadStart Events';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (!data || data.secret !== SECRET) {
      return jsonOutput({ ok: false, error: 'Unauthorized' });
    }

    var recipients = (data.to || []).join(',');
    if (!recipients) {
      return jsonOutput({ ok: false, error: 'No recipients' });
    }

    GmailApp.sendEmail(recipients, data.subject || '(no subject)', 'Please view this email in an HTML capable mail client.', {
      htmlBody: data.html || '',
      name: SENDER_NAME
    });

    return jsonOutput({ ok: true });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional: run this function once from the editor (Run -> testSend)
 * to check everything works. It sends a test email to yourself.
 */
function testSend() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), 'Event Operations test', '', {
    htmlBody: '<p>Your Apps Script email sender is working correctly.</p>',
    name: SENDER_NAME
  });
}
