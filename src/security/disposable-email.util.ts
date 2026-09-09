const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  '14n.co.uk',
  '33mail.com',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.info',
  'pokemail.net',
  'spam4.me',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'maildrop.cc',
  'mailnesia.com',
  'mailcatch.com',
  'mailnull.com',
  'mailinator.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'nospam.ze.tc',
  'nomail.xl.cx',
  'mega.zik.dj',
  'speed.1s.fr',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'trashmail.com',
  'trashmail.net',
  'trashmail.org',
  'trash-mail.com',
  'trash-mail.at',
  'trash-mail.de',
  'trashemail.de',
  'throwawaymail.com',
  'throwawayemailaddress.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempail.com',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempmailer.com',
  'tempmailer.de',
  'tempinbox.com',
  'tempinbox.co.uk',
  'temporary-mail.net',
  'temporarymail.com',
  'tmpmail.org',
  'tmpmail.net',
  'getnada.com',
  'nada.email',
  'getairmail.com',
  'fakeinbox.com',
  'fakemailgenerator.com',
  'emailondeck.com',
  'discard.email',
  'discardmail.com',
  'discardmail.de',
  'dispostable.com',
  'disposablemail.com',
  'disposableinbox.com',
  'dodgeit.com',
  'dodgit.com',
  'spamgourmet.com',
  'spamgourmet.net',
  'spamgourmet.org',
  'spamhole.com',
  'spambox.us',
  'spamfree24.org',
  'spamfree24.de',
  'spamfree24.eu',
  'spamfree24.info',
  'spamfree24.net',
  'spamherelots.com',
  'spamthisplease.com',
  'mintemail.com',
  'mytemp.email',
  'emailfake.com',
  'emailtemporario.com.br',
  'correotemporal.org',
  'tempomail.fr',
  'mohmal.com',
  'moakt.com',
  'inboxkitten.com',
  'inboxbear.com',
  'gettempmail.com',
  'burnermail.io',
  'mailnesia.com',
  'maildrop.cc',
  'mailinator.com',
  'guerrillamail.com',
  'sharklasers.com',
  'mailcatch.com',
  'mailnull.com',
  'tmpeml.com',
  'tmpbox.net',
  'dropmail.me',
  'mini-mail.net',
  'easytrashmail.com',
  'einrot.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  'cuvox.de',
  'dayrep.com',
  'einrot.de',
  'fleckens.hu',
  'gustr.com',
  'armyspy.com',
  'cuvox.de',
  'einrot.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'teleworm.us',
  'mailinater.com',
  'safetymail.info',
  'sogetthis.com',
  'spamhereplease.com',
  'thisisnotmyrealemail.com',
  'veryrealemail.com',
  'wh4f.org',
  'incognitomail.org',
  'incognitomail.com',
  'incognitomail.net',
  'fakemail.net',
  'anonaddy.com',
  'anonaddy.me',
  'addy.io',
  'simplelogin.com',
  'simplelogin.co',
  'slmails.com',
  '33mail.com',
  'getnada.com',
  'emailnax.com',
  'generator.email',
  'emkei.cz',
  'nowmymail.com',
  'throwam.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'grr.la',
  'pokemail.net',
  'spam4.me',
  'bccto.me',
  'chacuo.net',
  '027168.com',
  '1secmail.com',
  '1secmail.org',
  '1secmail.net',
  'esiix.com',
  'wwjmp.com',
  'oosln.com',
  'vjuum.com',
  'xojxe.com',
  'yoggm.com',
]);

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');

  if (at <= 0 || at === trimmed.length - 1) {
    return null;
  }

  const domain = trimmed
    .slice(at + 1)
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  if (!domain || !domain.includes('.')) {
    return null;
  }

  return domain;
}

export function isDisposableEmailDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (DISPOSABLE_EMAIL_DOMAINS.has(normalized)) {
    return true;
  }

  const labels = normalized.split('.');

  for (let i = 1; i < labels.length - 1; i += 1) {
    const suffix = labels.slice(i).join('.');

    if (DISPOSABLE_EMAIL_DOMAINS.has(suffix)) {
      return true;
    }
  }

  return false;
}

export function isDisposableEmail(email: string): boolean {
  const domain = extractEmailDomain(email);

  if (!domain) {
    return false;
  }

  return isDisposableEmailDomain(domain);
}
