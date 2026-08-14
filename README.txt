KidsSite v1.2

A simple parent-controlled kids video website.

NEW IN v1.2
- YouTube's normal control bar is hidden (controls=0).
- Big KidsSite controls: back 10 seconds, play/pause, forward 10 seconds, mute, fullscreen.
- YouTube player volume is capped at 50%.
- Default video volume is 35%.
- Existing approved videos, PIN and timer settings remain saved in the same browser through localStorage.

IMPORTANT
The 50% limit applies to the YouTube player's internal volume. A phone/tablet/computer's physical hardware volume buttons can still raise the device speaker volume. Device-level volume locking must be configured separately on the device.

HOW TO UPDATE GITHUB PAGES
Upload/replace these files in your KidsSite repository root:
- index.html
- style.css
- script.js
- README.txt

Commit the changes. GitHub Pages should redeploy automatically.


KidsSite v1.3: Fixed video playback initialization. Videos now cue first and wait for an explicit Play tap, with clear loading/error messages and cache-busted JS/CSS files. Volume remains capped at 50%.
