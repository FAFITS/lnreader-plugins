# Archive of Our Own (AO3)

Multilingual Nekori source. Popular works default to kudos; Latest sorts by the
last update. Search accepts AO3's normal search syntax.

Fandoms, characters, relationships, additional tags, and excluded tags use
MultiText with live AO3 autocomplete. Each chip is a tag name. Included tags must
all match; any excluded tag removes a work. Exact names can also be entered
manually when autocomplete is unavailable.

Works have no standard cover image on AO3, so the source leaves covers unset.
Reader content includes the chapter body and inline images, without summaries,
author notes, navigation, or comments. Requests use `view_adult=true`; works
restricted to registered users still require an authenticated WebView session.
HTTP errors and challenge pages are reported as errors rather than empty results.

The implementation follows the public [AO3 source](https://github.com/otwcode/otwarchive):

- `app/controllers/autocomplete_controller.rb`
- `app/models/search/work_search_form.rb` and `taggable_query.rb`
- `app/views/works/` and `app/views/chapters/_chapter.html.erb`

The icon is AO3's `public/images/ao3_logos/logo.png` from that repository.
