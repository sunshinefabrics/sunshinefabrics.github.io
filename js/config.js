/* ------------------------------------------------------------------
   Sunshine Fabrics - settings you may need to change

   googleClientId
     Leave it empty and the software runs entirely on this computer.
     To switch Google Drive sync on, paste the OAuth Client ID from
     your Google Cloud project here. Setup steps are in README.md.

     This ID is public by design. It is safe to leave it in the file,
     because Google only accepts it from the website addresses you
     list under "Authorised JavaScript origins".

   driveFileName
     The name of the single file the software keeps in Google Drive.

   drivePollSeconds
     How often an idle device looks to see whether another device has
     been entering. 60 is right for a shop. Raise it on a slow or
     metered connection, lower it if two counters work side by side.
     Minimum 15.
------------------------------------------------------------------ */
window.SUNSHINE_CONFIG = {
  businessName:  "SUNSHINE FABRICS",
  googleClientId: "280793711310-jdvsbvu0ur7ioqq20fjn8mrsl3m5ffcq.apps.googleusercontent.com",
  driveFileName: "sunshine-fabrics-register.json",
  drivePollSeconds: 60
};
