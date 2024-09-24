A Firefox extension which collects urls from the user and then turns the body of the page into markdown for each url. It works like this:

- a user begins the process of "listening" for urls by pressing a button on the Extension pop-out or pressing a shortcut
- while the listening process runs, each time the user presses a specific button (choose something reasonable here), the urls of the page the user is on when pressing it is saved, and the body contents of the page will begin to be turned into markdown
- when the user presses the button or the button in the extension pop-out again, the "listening" stops
- at any time, that is either during listening or not listening, the user can press another button in the pop-out or a shortcut which will open a new browser tab where a basic HTML page is being generated/opened with collapsible/expandable boxes which each contain the (markdown-) text for a site, editable, inside of it and the page core domain as title with the rest of the url path being in gray text. Once a user edits a text in a box, that should be considered as saved change, so ne extra save Button (per text box), just save on edit. If the markdown scraping process is still running for a box, show a loading indicator and an Infotext.
- in that HTML page or just by pressing a button in the pop-out, if all markdown texts are available (fully scraped), a user can press a button (or a shortcut) to copy the concatenated markdown contents, separated using XML tags, and each with their url and title, to the clipboard or a txt or md file.

# TODO

- [ ] add deletion of markdown entries
- [ ] add updating of markdown entries (with diffs and accept/decline)
