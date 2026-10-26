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

   allowedGoogleAccounts
     The Google account or accounts this register belongs to. The
     software refuses to sync with any other account, so signing in
     with a personal Gmail by mistake cannot copy the shop's register
     into the wrong Drive, and cannot quietly start a second empty one.
     Leave the list empty to allow any account.
------------------------------------------------------------------ */
window.SUNSHINE_CONFIG = {
  businessName:  "SUNSHINE FABRICS",
  googleClientId: "280793711310-jdvsbvu0ur7ioqq20fjn8mrsl3m5ffcq.apps.googleusercontent.com",
  driveFileName: "sunshine-fabrics-register.json",
  drivePollSeconds: 60,
  allowedGoogleAccounts: ["app.sunshinefabrics@gmail.com"]
};
