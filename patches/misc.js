import { definePatch, insert } from "../modUtils.js"
import { styleText } from "node:util";

export default definePatch(({ insertCode, modifyCode, replaceCode, replaceOne }) => {

  // Display tick number near the moving bars in the balance box
  replaceOne(
    /(zX\.fillStyle=ej===9\?bE\.pW:bE\.oO;var aBL=af\.aBM;var aBN="\+"\+aBL;var tj=zX\.measureText\(aBN\)\.width;var aBO=Math\.floor\(this\.k\/12\);var no=\.5\*\(j\+ti\)\+aBO;if\(no\+tj\+aB9<=j\)\{zX\.fillText\(aBN,Math\.floor\(no\+\.5\*tj\),Math\.floor\(\.3\*this\.k\)\)\}else if\(aBL>=1e3\)\{aBN="\+"\+Math\.floor\(aBL\/1e3\)\+"K";tj=zX\.measureText\(aBN\)\.width;if\(no\+tj\+aB9<=j\)\{zX\.fillText\(aBN,Math\.floor\(no\+\.5\*tj\),Math\.floor\(\.3\*this\.k\)\)\}\})/g,
    `$1;if(__fx.settings.displayTickNumber)zX.fillText(9-ej,Math.floor(aB9*2+aBO),Math.floor(.3*this.k));`
  )

  // Add FX Client version info to the game version window
  modifyCode(`4, 1, new g(__L(), b.c + "<br>" + d.e.f("/changelog")
    ${insert(` + "<br><br><b>" + "Omen Client v" + __fx.version
      + "<br><a href='https://discord.gg/dyxcwdNKwK' target='_blank'>Omen Client Discord server</a>"`)} /*...*/)`)
  
  // Hide propaganda popup
  replaceOne(
    /ed=bi\.eZ\+60\*1e3;\(new ek\)\.show\(ec\.el,ec\.colors,ec\.id\);ec=null;return true/g,
    `$&;var currentPropaganda=__fx.propagandaTracker.getCurrentPropaganda();if(currentPropaganda){if(__fx.settings.hidePropagandaPopups)__fx.propagandaTracker.onPopupShown();else if(!currentPropaganda.isSystemMessage)bi.eZ+=100*60*1000;}`
  )

  // Report errors using custom function
  replaceOne(/c="SE\|"\+c\+"\|"\+e;console\.log\(c\);alert\(c\)/g, `c="SE|"+c+"|"+e;console.log(c);__fx.reportError(e,c);alert(c)`)

  // Invalid hostname detection avoidance (ensures Turnstile captcha and server anti-bot validation pass)
  replaceOne(/this\.(\w+)=\w+\.indexOf\("territorial\.io"\)>=0;/g, `this.$1 = true; this.e3 = true; this.hostnameIsValid = true;`)
  replaceOne(/window\.turnstile\.remove\(em\);/g, `try{window.turnstile.remove(em)}catch(e){}`)

  // for the custom lobby version
  try {
    modifyCode(`new a("⚔️<br>" + __L(), function() {
      ${insert(`if (__fx.isCustomLobbyVersion) alert("This version is for use with custom lobbies only. For normal multiplayer, use the version at https://fxclient.github.io/FXclient/")
      else`)} b(0);
		}, ${insert(`__fx.isCustomLobbyVersion ? "rgba(50, 50, 50, 0.6)" : `)} c.d)`)
  } catch (error) {
    console.warn(styleText("yellow", `Warning: failed to apply patches specific to the custom lobby version`))
  }
})