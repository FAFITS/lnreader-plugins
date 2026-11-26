# Archive of Our Own (AO3)

Multilingual Nekori source. Popular works default to kudos; Latest sorts by the
last update. Search accepts AO3's normal search syntax.

Fandoms, characters, relationships, additional tags, and excluded tags use
MultiText with live AO3 autocomplete. Each chip is a tag name. Included tags must
all match; any excluded tag removes a work. Exact names can also be entered
manually when autocomplete is unavailable.

Autocomplete requests explicitly ask for JSON and identify themselves as AJAX;
AO3's JSON-only endpoint otherwise treats browser-style Accept headers as HTML.
If Cloudflare blocks requests, open AO3 in the app's WebView and complete the
challenge before retrying. Requests use the host's shared cookie jar; failed
autocomplete requests are not cached.

Works have no standard cover image on AO3, so the source leaves covers unset.
Reader content includes the chapter body and inline images, without summaries,
author notes, navigation, or comments. Requests use `view_adult=true`; works
restricted to registered users still require an authenticated WebView session.
HTTP errors and challenge pages are reported as errors rather than empty results.

Library compatibility: keep the plugin ID `archiveofourown`, the source name
`Archive Of Our Own`, and the English repository group. Catalog results use
LNReader's original `works/ID` paths without a leading slash. When refreshing
those library entries, chapter paths and full titles come from `/navigate`, as
in LNReader's AO3 plugin, including for one-shots. Entries added by earlier 2.x
versions with leading-slash paths retain their existing path and title scheme.
This preserves download lookup identities; the plugin cannot rename or recover
files on the device. Back up the library and download folder before recovery.

The implementation follows the public [AO3 source](https://github.com/otwcode/otwarchive):

- `app/controllers/autocomplete_controller.rb`
- `app/models/search/work_search_form.rb` and `taggable_query.rb`
- `app/views/works/` and `app/views/chapters/_chapter.html.erb`

The icon is AO3's `public/images/ao3_logos/logo.png` from that repository.
