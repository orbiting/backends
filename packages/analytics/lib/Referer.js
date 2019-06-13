
const referrerNames = {
  'm.facebook.com': 'Facebook',
  'l.facebook.com': 'Facebook',
  'lm.facebook.com': 'Facebook',
  'www.facebook.com': 'Facebook',
  't.co': 'Twitter',
  'twitter.com': 'Twitter',
  'mobile.twitter.com': 'Twitter',
  'com.twitter.android': 'Twitter',
  'com.samruston.twitter': 'Twitter',
  'tweetdeck.twitter.com': 'Twitter',
  'en.m.wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia',
  'de.m.wikipedia.org': 'Wikipedia',
  'de.wikipedia.org': 'Wikipedia',
  'com.google.android.gm': 'GMail Android App',
  'deref-gmx.net': 'Webmail',
  'deref-web-02.de': 'Webmail',
  'rich-v01.bluewin.ch': 'Webmail',
  'rich-v02.bluewin.ch': 'Webmail',
  'mail.yahoo.com': 'Webmail',
  'outlook.live.com': 'Webmail',
  'webmail1.sunrise.ch': 'Webmail',
  'office.hostpoint.ch': 'Webmail',
  'mail.zhaw.ch': 'Webmail',
  'mail.google.com': 'Webmail',
  'idlmail04.lotus.uzh.ch': 'Webmail',
  'ms13xwa.webland.ch': 'Webmail',
  'com.google.android.googlequicksearchbox': 'Google',
  'republik.us14.list-manage.com': 'Republik-Newsletter'
}

/*
REFERRER_TYPE_DIRECT_ENTRY = 1:
  If set to this value, other referer_... fields have no meaning.
REFERRER_TYPE_SEARCH_ENGINE = 2:
  If set to this value, referer_url is the url of the search engine and referer_keyword is the keyword used (if we can find it).
REFERRER_TYPE_WEBSITE = 3
  If set to this value, referer_url is the url of the website.
REFERRER_TYPE_CAMPAIGN = 6:
  If set to this value, referer_name is the name of the campaign.
*/
const getName = (visit) => {
  switch (visit.referer_type) {
    case 6:
      return visit.referer_name.startsWith('republik/newsletter-editorial')
        ? 'Republik-Newsletter'
        : `Kampagne: ${visit.referer_name}`
    case 3:
    case 2:
      const name = referrerNames[visit.referer_name]
      if (name) {
        return name
      }
      if (
        visit.referer_name.indexOf('mail') > -1 ||
        visit.referer_name.indexOf('bluewin') > -1 ||
        visit.referer_name.indexOf('GMail') > -1
      ) {
        return 'Webmail'
      }
      return visit.referer_name
    case 1:
      return 'Direkt / Keine Angabe'
    default:
      return 'Direkt / Keine Angabe'
  }
}

const getForVisit = (visit) => {
  const name = getName(visit).trim()
  return {
    name,
    isCampaign: name.indexOf('Kampagne') === 0
  }
}

module.exports = {
  getForVisit
}
