require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const getStream = require("get-stream");
const mongoose = require("mongoose");
const _ = require("lodash");
const xl = require("excel4node");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

/* mongoose.connect("mongodb://localhost:27017/flohmarktDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}); */

mongoose.connect("mongodb://mongo:27017/flohmarktDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
});

userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);
passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

const flohmarktSchema = new mongoose.Schema({
  flohmarktId: Number,
  flohmarktBezeichnung: String,
  datum: Date,
  ownerID: String,
  userEmails: [String],
});
const Flohmarkt = mongoose.model("Flohmarkt", flohmarktSchema);

const verkaeuferSchema = new mongoose.Schema({
  vorname: String,
  nachname: String,
  email: String,
  vNummer: Number,
  aktiv: Boolean,
  aktivToggled: Boolean,
  userId: Number,
});
const Verkaeufer = mongoose.model("Verkaeufer", verkaeuferSchema);

const artikelSchema = new mongoose.Schema({
  name: String,
  verkaeufer: String,
  nummer: Number,
  preis: Number,
});
const Artikel = mongoose.model("Artikel", artikelSchema);

const bonSchema = new mongoose.Schema({
  vorgang: Number,
  datum: Date,
  kundenabschluss: Boolean,
  artikel: [artikelSchema],
  summe: Number,
  kasse: Number,
  flohmarktId: Number,
});
const Bon = mongoose.model("Bon", bonSchema);

const auswertungSchema = new mongoose.Schema({
  vNummer: Number,
  nachname: String,
  vorname: String,
  artikel: [artikelSchema],
  summe: Number,
  flohmarktId: Number,
});
const Auswertung = mongoose.model("Auswertung", auswertungSchema);

app.get("/", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.cookies.FMNr) {
      let foundFlohmarkt = await Flohmarkt.findOne({
        flohmarktId: req.cookies.FMNr,
      });
      res.render("home", {
        flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
      });
    } else {
      res.redirect("/meineMaerkte");
    }
  } else {
    res.render("home", {

    });
  }
});

app.get("/login", function (req, res) {
  res.render("login");
});
app.get("/register", function (req, res) {
  res.render("register");
});

app.post("/register", function (req, res) {
  User.register(
    { username: req.body.username },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/register");
      } else {
        passport.authenticate("local")(req, res, function () {
          res.redirect("/etiketten");
        });
      }
    }
  );
});

/* app.post("/login", function (req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });
  req.login(user, function (err) {
    if (err) {
      console.log(err); 
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/etiketten");
      });
    }
  });
}); */

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

app.post("/updateToNewVersion", async function (req, res) {
  const newFM = new Flohmarkt({
    flohmarktBezeichnung: "24. Brühler Kindersachenflohmarkt",
    datum: new Date("04/02/2022"),
    ownerID: req.user._id,
    flohmarktId: 0,
  });
  await newFM.save();
  let vari = await Bon.updateMany(
    {},
    {
      $set: {
        flohmarktId: 0,
      },
    }
  );
  let vari2 = await Auswertung.updateMany(
    {},
    {
      $set: {
        flohmarktId: 0,
      },
    }
  );
  res.redirect("/meineMaerkte");
});

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

app.post("/reset", function (req, res) {
  Verkaeufer.remove({}, function (err) {
    console.log("VerkäuferDB removed");
    Artikel.remove({}, function (err) {
      console.log("ArtikelDB removed");
      Bon.remove({}, function (err) {
        console.log("BonDB removed");
        User.remove({}, function (err) {
          Auswertung.remove({}, function (err) {
            console.log("AuswertungDB removed");
            res.redirect("/");
          });
        });
      });
    });
  });
});

app.post("/bonDbReset", function (req, res) {
  res.clearCookie("FMBonNr");

  Artikel.remove({}, function (err) {
    console.log("ArtikelDB removed");
    Bon.remove({}, function (err) {
      console.log("BonDB removed");

      Auswertung.remove({}, function (err) {
        console.log("AuswertungDB removed");
        res.redirect("/auswertung");
      });
    });
  });
});

app.get("/auswertung", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.cookies.FMNr) {
      let foundFlohmarkt = await Flohmarkt.findOne({
        flohmarktId: req.cookies.FMNr,
      });
      Auswertung.find(
        { flohmarktId: req.cookies.FMNr },
        function (err, foundAuswert) {
          res.render("auswertung", {
            auswertungen: foundAuswert,
            flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
          });
        }
      );
    } else {
      res.redirect("/meineMaerkte");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/archiv", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.cookies.FMNr) {
      if (req.cookies.Archivfilter) {
        let foundFlohmarkt = await Flohmarkt.findOne({
          flohmarktId: req.cookies.FMNr,
        });
        let allBons = await Bon.find({
          flohmarktId: req.cookies.FMNr,
          kundenabschluss: true,
          artikel: { $elemMatch: { nummer: req.cookies.Archivfilter } },
          summe: { $ne: 0 },
          
        });

        res.render("bonarchiv", {
          flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
          bons: allBons,
          filter: req.cookies.Archivfilter,
        });
      } else {
        let foundFlohmarkt = await Flohmarkt.findOne({
          flohmarktId: req.cookies.FMNr,
        });
        let allBons = await Bon.find({
          flohmarktId: req.cookies.FMNr,
          kundenabschluss: true,
          summe: { $ne: 0 },
        });

        res.render("bonarchiv", {
          flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
          bons: allBons,
          filter: "",
        });
      }
    } else {
      res.redirect("/meineMaerkte");
    }
  } else {
    res.redirect("/login");
  }
});
app.post("/archivfiltern", async function (req, res) {
  res.clearCookie("Archivfilter");
  if(req.body.artikelnummer=== ""){
    res.redirect("/archiv");
  }else{
  res.cookie(`Archivfilter`, req.body.artikelnummer, {
    maxAge: 1 * 60 * 60 * 1000, //1h
    secure: true,
    httpOnly: true,
  });
  res.redirect("/archiv");
}
});
app.post("/deletefilter", async function (req, res) {
  res.clearCookie("Archivfilter");
  res.redirect("/archiv");
});

app.post("/bonwaehlen", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.cookies.FMNr) {
      if (req.cookies.Archivfilter) {
        let foundFlohmarkt = await Flohmarkt.findOne({
          flohmarktId: req.cookies.FMNr,
        });
        let allBons = await Bon.find({
          flohmarktId: req.cookies.FMNr,
          kundenabschluss: true,
          artikel: { $elemMatch: { nummer: req.cookies.Archivfilter } },
          summe: { $ne: 0 },
        });
        let bon = await Bon.findOne({
          flohmarktId: req.cookies.FMNr,
          kundenabschluss: true,
          vorgang: req.body.bonNummer,
        });
        if (bon) {
          res.render("bongewaehlt", {
            flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
            bons: allBons,
            bon: bon,
            filter: req.cookies.Archivfilter
          });
        } else {
          res.redirect("/archiv");
        }
      } else {
        let foundFlohmarkt = await Flohmarkt.findOne({
          flohmarktId: req.cookies.FMNr,
        });
        let allBons = await Bon.find({
          flohmarktId: req.cookies.FMNr,
          kundenabschluss: true,
          summe: { $ne: 0 },
        });
        let bon = await Bon.findOne({
          flohmarktId: req.cookies.FMNr,
          kundenabschluss: true,
          vorgang: req.body.bonNummer,
        });
        if (bon) {
          res.render("bongewaehlt", {
            flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
            bons: allBons,
            bon: bon,
            filter: ""
          });
        } else {
          res.redirect("/archiv");
        }
      }
    } else {
      res.redirect("/meineMaerkte");
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/deleteArtikel", async function (req, res) {
  let objekt = JSON.parse(req.body.welcherArtikel);

  let loeschen = await Bon.updateOne(
    { vorgang: req.body.bonNo, flohmarktId: req.cookies.FMNr },
    {
      $pull: { artikel: { _id: objekt.id } },
      $set: {
        summe: req.body.summe - parseInt(String(objekt.artikelNo).slice(4)),
      },
    },
    { safe: true }
  );

  res.clearCookie("Archivfilter");
  res.redirect("/archiv");
});

app.post("/setSummeAll", async function (req, res) {
  let foundbons = await Bon.find({});
  foundbons.forEach(async function (bon) {
    console.log(bon);
    let sum = 0;
    bon.artikel.forEach(function (artikel) {
      console.log("Artikel: " + artikel);
      sum = sum + parseInt(String(artikel.nummer).slice(4));
      console.log(sum);
    });

    let addedSum = await Bon.updateOne(
      {
        vorgang: bon.vorgang,
        flohmarktId: bon.flohmarktId,
      },
      {
        summe: sum,
      },
      { safe: true }
    );
  });

  res.redirect("/archiv");
});

app.get("/verkaeufer", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.cookies.FMNr) {
      let foundFlohmarkt = await Flohmarkt.findOne({
        flohmarktId: req.cookies.FMNr,
      });
      console.log(req.query.reihe);
      let nextID = 4001;
      let lastID = 4000;
      let passedVariable = req.query.valid;
      let error = "";
      if (typeof passedVariable !== "undefined") {
        error = passedVariable;
      }
      Verkaeufer.find({})
        .sort({ vNummer: 1 })
        .exec(function (err, allVerk) {
          for (let i = 0; i < allVerk.length; i++) {
            let thisID = allVerk[i].vNummer;
            if (thisID - lastID > 1) {
              nextID = lastID + 1;
              break;
            }
            if (allVerk.length - i == 1) {
              nextID = thisID + 1;
            }
            lastID = allVerk[i].vNummer;
          }

          Verkaeufer.find({ aktiv: true })
            .sort({ vNummer: 1 })
            .exec(function (err, verkAktiv) {
              Verkaeufer.find({ aktiv: { $ne: true } })
                .sort({ vNummer: 1 })
                .exec(function (err, verkPassiv) {
                  res.render("verkaeufer", {
                    verkaeufer: verkAktiv,
                    verkaeuferPassiv: verkPassiv,
                    nextNummer: nextID,
                    errorcode: error,
                    flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
                    anchor: req.query.reihe,
                  });
                });
            });
        });
    } else {
      res.redirect("/meineMaerkte");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/kasse", async function (req, res) {
  if (req.isAuthenticated()) {
    let flohMarktCookie = req.cookies.FMNr;
    let passedVariable1 = req.query.validBon;
    let error1 = "";
    if (typeof passedVariable1 !== "undefined") {
      error1 = passedVariable1;
    }
    let passedVariable2 = req.query.validSeller;
    let error2 = "";
    if (typeof passedVariable2 !== "undefined") {
      error2 = passedVariable2;
    }
    if (req.cookies.FMNr) {
      let foundFlohmarkt = await Flohmarkt.findOne({
        flohmarktId: req.cookies.FMNr,
      });
      if (req.cookies.FMBonNr) {
        console.log("cookie vorhanden: " + req.cookies.FMBonNr);
        let cookie = req.cookies.FMBonNr;
        Bon.findOne(
          { vorgang: cookie, flohmarktId: req.cookies.FMNr },
          async function (err, foundBon) {
            if (foundBon) {
              //console.log("Fehler: " + err);
              if (foundBon.artikel.length > 0) {
                let summe = await gesamtpreisBon(foundBon.artikel);
                res.render("kasse", {
                  artikels: foundBon.artikel,
                  bonNummer: cookie,
                  summe: summe,
                  errorcode1: error1,
                  errorcode2: error2,
                  flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
                });
              } else {
                console.log();
                res.render("kasse", {
                  artikels: foundBon.artikel,
                  bonNummer: cookie,
                  summe: 0,
                  errorcode1: error1,
                  errorcode2: error2,
                  flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
                });
              }
            } else {
              res.clearCookie("FMBonNr");
              res.redirect("/kasse");
            }
          }
        );
      } else {
        Bon.find(
          { flohmarktId: req.cookies.FMNr },
          async function (err, foundBons) {
            if (foundBons.length === 0) {
              const bon = new Bon({
                vorgang: 1,
                flohmarktId: req.cookies.FMNr,
              });
              await bon.save();
              res.cookie(`FMBonNr`, 1, {
                maxAge: 3 * 24 * 60 * 60 * 1000, //3Tage
                secure: true,
                httpOnly: true,
              });
              res.redirect("/kasse");
            } else {
              const bon = new Bon({
                vorgang: foundBons.length + 1,
                flohmarktId: req.cookies.FMNr,
              });
              bon.save();
              res.cookie(`FMBonNr`, foundBons.length + 1, {
                maxAge: 3 * 24 * 60 * 60 * 1000, //3Tage
                secure: true,
                httpOnly: true,
              });
              res.redirect("/kasse");
            }
          }
        );

        // console.log("cookie nicht vorhanden");
      }
    } else {
      res.redirect("/meineMaerkte");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/etiketten", function (req, res) {
  res.render("etiketten", { flohmarktBezeichung: "" });
});
app.post("/etikettenErstellen", async function (req, res) {
  etikettenMake(req, res);
  //res.redirect("/etiketten");//später rausnehmen
});

app.post("/artikelhinzufuegen", async function (req, res) {
  if (req.cookies.FMBonNr) {
    const neuerArtikel = req.body.neuerArtikel;
    const stringArtikel = neuerArtikel.toString();
    const verkaeuferNo = Number(stringArtikel.slice(0, 4));

    let foundBon = await Bon.findOne(
      {
        vorgang: req.cookies.FMBonNr,
        flohmarktId: req.cookies.FMNr,
      }
    );


    const artikel = await new Artikel({
      nummer: neuerArtikel,
    });

    let foundVerkaeufer = await Verkaeufer.findOne(
      { vNummer: verkaeuferNo })


    if (!foundVerkaeufer || !foundVerkaeufer.aktiv) {
      var string = encodeURIComponent(
        "Verkäufer " + verkaeuferNo + "  ist nicht vorhanden."
      );
      res.redirect("/kasse?validSeller=" + string);
    } else {
      await foundBon.artikel.push(artikel);
      await foundBon.save();
      res.redirect("/kasse");
    }



  } else {
    res.redirect("/kasse");
  }
});

app.post("/artikelhinzufuegenALT",function (req, res) {
  if (req.cookies.FMBonNr) {
    const neuerArtikel = req.body.neuerArtikel;
    const stringArtikel = neuerArtikel.toString();
    const verkaeuferNo = Number(stringArtikel.slice(0, 4));

    Bon.findOne(
      {
        vorgang: req.cookies.FMBonNr,
        flohmarktId: req.cookies.FMNr,
      },
      function (err, foundBon) {
        const artikel = new Artikel({
          nummer: neuerArtikel,
        });
        Verkaeufer.findOne(
          { vNummer: verkaeuferNo },
          function (err, foundVerkaeufer) {
            if (!foundVerkaeufer || !foundVerkaeufer.aktiv) {
              var string = encodeURIComponent(
                "Verkäufer " + verkaeuferNo + "  ist nicht vorhanden."
              );
              res.redirect("/kasse?validSeller=" + string);
            } else {
              foundBon.artikel.push(artikel);
              foundBon.save();
              res.redirect("/kasse");
            }
          }
        );
      }
    );
  } else {
    res.redirect("/kasse");
  }
});


app.post("/artikelstornieren", function (req, res) {
  //welcher Bon? welcher Artikel? dann aus bon(datenbank löschen)

  Bon.findOne(
    {
      artikel: { $elemMatch: { _id: req.body.artikelId } },
    },
    function (err, foundBon) { }
  );
  Bon.updateOne(
    {
      artikel: { $elemMatch: { _id: req.body.artikelId } },
    },
    { $pull: { artikel: { _id: req.body.artikelId } } },
    function (err) {
      console.log(err);
    }
  );
  /*Bon.findOne({ Artikel:{$elemMatch: {nummer: req.body.artikelId}}}, function(err, foundBon){
  console.log(foundBon);
});*/
  res.redirect("/kasse");
});

app.post("/verkaeuferhinzufuegen", function (req, res) {
  const r = req.body;
  Verkaeufer.findOne(
    { vNummer: r.verknummer },
    async function (err, foundverkaeufer) {
      if (!foundverkaeufer) {
        const newVerk = new Verkaeufer({
          vorname: r.vorname,
          nachname: r.nachname,
          email: r.email,
          vNummer: r.verknummer,
          aktiv: true,
        });
        await newVerk.save();
        res.redirect("/verkaeufer");
      } else {
        var string = encodeURIComponent(
          " " + r.verknummer + " ist bereits vergeben."
        );

        res.redirect("/verkaeufer?valid=" + string);
      }
    }
  );
});

app.get("/meineMaerkte", async function (req, res) {
  if (req.isAuthenticated()) {
    if (req.cookies.FMNr) {
      let foundFlohmarkt = await Flohmarkt.findOne({
        flohmarktId: req.cookies.FMNr,
      });
      Flohmarkt.find({ ownerID: req.user._id })
        .sort({ datum: 1 })
        .exec(function (err, foundFlohmaerkte) {
          //console.log(foundFlohmaerkte);

          res.render("meinemaerkte", {
            flohmaerkte: foundFlohmaerkte,
            flohmarktBezeichung: foundFlohmarkt.flohmarktBezeichnung,
          });
        });
    } else {
      Flohmarkt.find({ ownerID: req.user._id })
        .sort({ datum: 1 })
        .exec(function (err, foundFlohmaerkte) {
          //console.log(foundFlohmaerkte);

          res.render("meinemaerkte", {
            flohmaerkte: foundFlohmaerkte,
            flohmarktBezeichung: "BITTE FLOHMARKT AUSWÄHLEN",
          });
        });
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/neuerflohmarkt", function (req, res) {
  const r = req.body;
  let parts = r.datum.split(".");
  Flohmarkt.find({}, async function (err, foundFM) {
    const newFM = new Flohmarkt({
      flohmarktBezeichnung: r.bezeichnung,
      datum: new Date(parts[2], parts[1] - 1, parts[0], 12),
      ownerID: req.user._id,
      flohmarktId: foundFM.length + 1,
    });
    await newFM.save();

    res.clearCookie("FMNr");
    res.clearCookie("FMBonNr");
    res.cookie(`FMNr`, foundFM.length + 1, {
      maxAge: 365 * 24 * 60 * 60 * 1000, //3Tage
      secure: true,
      httpOnly: true,
    });
    res.redirect("/meinemaerkte");
  });
});

app.post("/setFlohmarkt", function (req, res) {
  const r = req.body;
  console.log("FM Nummer: " + r.flohmarktNummer);
  res.clearCookie("FMNr");
  res.clearCookie("FMBonNr");
  res.cookie(`FMNr`, r.flohmarktNummer, {
    maxAge: 365 * 24 * 60 * 60 * 1000, //3Tage
    secure: true,
    httpOnly: true,
  });
  res.redirect("/meinemaerkte");
});

app.post("/verkaeuferloeschen", function (req, res) {
  const r = req.body;

  Verkaeufer.deleteOne({ vNummer: r.verkNo }, function (err) {
    if (err) {
      console.log(err);
    }
  });
  res.redirect("/verkaeufer");
});

app.post("/verkaeuferStatusToggle", function (req, res) {
  let idPara;

  if (req.body.reihe) {
    if (parseInt(req.body.reihe.slice(5)) > 0) {
      let reihe = parseInt(req.body.reihe.slice(5)) - 1;
      idPara = "verk_" + reihe;
    } else {
      idPara = "verk_0";
    }
  }
  Verkaeufer.findOne({ vNummer: req.body.verkNo }, function (err, foundVerk) {
    foundVerk.aktiv = !foundVerk.aktiv;
    foundVerk.save();

    res.redirect("/verkaeufer?reihe=" + idPara);
  });
});

app.post("/verkInAuswert", async function (req, res) {
  verkäuferInAuswertung();

  res.redirect("/auswertung");
});

app.post("/auswerten", async function (req, res) {
  await verkäuferInAuswertung(req.cookies.FMNr);

  res.redirect("/auswertung");
});
app.post("/auswertungEinzeln", async function (req, res) {
  await verkäuferInAuswertung();
  Auswertung.find(
    { flohmarktId: req.cookies.FMNr },
    async function (err, foundAuswertungen) {
      if (foundAuswertungen.length) {
        console.log(foundAuswertungen + "   Fehler: " + err);
        await auswertungProVerkaeufer(req, res);
      } else {
        res.redirect("/auswertung");
      }
    }
  );
});

app.post("/summieren", async function (req, res) {
  auswertungSummieren();

  res.redirect("/auswertung");
});

app.get("/namensliste", function (req, res) {
  var wb = new xl.Workbook();
  var ws = wb.addWorksheet("SHEET_NAME");

  Verkaeufer.find({ aktiv: true })
    .sort({ vNummer: 1 })
    .exec(function (err, allVerk) {
      let zeile = 1;
      for (const verk of allVerk) {
        ws.cell(zeile, 1).number(verk.vNummer);
        ws.cell(zeile, 2).string(verk.vorname + " " + verk.nachname);
        ws.cell(zeile, 3).string(verk.email);
        zeile++;
      }
      wb.write(`Namensliste.xlsx`, res);
    });
});

app.post("/neuerBon", (req, res) => {
  if (req.cookies.FMBonNr) {
    Bon.findOne(
      { vorgang: req.cookies.FMBonNr, flohmarktId: req.cookies.FMNr },
      function (err, foundbon) {
        let sum = 0;
        foundbon.artikel.forEach(function (artikel) {
          sum = sum + parseInt(String(artikel.nummer).slice(4));
        });

        if (foundbon.artikel.length === 0) {
          var string = encodeURIComponent("Kein Artikel auf aktuellem Bon");

          res.redirect("/kasse?validBon=" + string);
        } else {
          Bon.updateOne(
            {
              vorgang: req.cookies.FMBonNr,
              flohmarktId: req.cookies.FMNr,
            },
            {
              datum: new Date(),
              kundenabschluss: true,
              summe: sum,
            },
            function (err) {
              if (err) {
                console.log(err);
              }
              res.clearCookie("FMBonNr");
              Bon.find(
                { flohmarktId: req.cookies.FMNr },
                function (err, foundbons) {
                  const bon = new Bon({
                    vorgang: foundbons.length + 1,
                    flohmarktId: req.cookies.FMNr,
                  });

                  bon.save();
                  res.cookie(`FMBonNr`, foundbons.length + 1, {
                    maxAge: 3 * 24 * 60 * 60 * 1000, //3Tage
                    secure: true,
                    httpOnly: true,
                  });

                  res.redirect("/kasse");
                }
              );
            }
          );
        }
      }
    );
  } else {
    res.redirect("/kasse");
  }
});

app.listen(7003, function () {
  console.log("Server started on port 7003");
});

function gesamtpreisBon(artikelliste, callback) {
  let summe = 0;
  let zahlstring;
  let wert;

  artikelliste.forEach(function (artikel) {
    zahlstring = artikel.nummer.toString();
    wert = Number(zahlstring.slice(4));
    summe = summe + wert;
  });
  return summe;
}

async function auswertung(FMCookie) {
  let zahlstring, verkNr, preisInCent;
  let gesamtumsatz = 0;
  //Suche nach allen Bons in Datenbank
  let foundBons = await Bon.find({ flohmarktId: FMCookie });
  console.log(foundBons, FMCookie);
  //Für jeden dieser Bons:
  for (const bon of foundBons) {
    //Für jeden Artikel auf dem Bon
    for (const artikel of bon.artikel) {
      //Die Artikelnummer beinhaltet Verkäufernummer und Preis. Beispiel A.No:11111999: Verkäufer 1111 und Preis 19,99€
      zahlstring = artikel.nummer.toString();
      verkNr = Number(zahlstring.slice(0, 4));
      preisInCent = Number(zahlstring.slice(4));
      //Auswertung speichert die jeweils verkauften Artikel pro Verkäufer ab
      let foundAuswertung = await Auswertung.findOne({
        vNummer: verkNr,
        flohmarktId: FMCookie,
      });
      console.log(verkNr, preisInCent);
      const auswerungsArtikel = new Artikel({
        preis: preisInCent,
      });
      if (!foundAuswertung) {
        console.log("Verkäufernummer ist nicht vergeben");
      } else {
        foundAuswertung.artikel.push(auswerungsArtikel);
        await foundAuswertung.save();
      }
    }
  }
  await auswertungSummieren(FMCookie);
}

async function verkäuferInAuswertung(FMCookie) {
  //löscht alle auswertungen
  const result = await Auswertung.deleteMany({ flohmarktId: FMCookie });
  //Sucht alle Verkäufer und legt zu jedem eine Auswertung an, die im nächsten Schritt gefüllt werden soll
  let foundVerk = await Verkaeufer.find({ aktiv: true }).sort("vNummer");
  for (const verkaeufer of foundVerk) {
    const auswertung = new Auswertung({
      vNummer: verkaeufer.vNummer,
      nachname: verkaeufer.nachname,
      vorname: verkaeufer.vorname,
      flohmarktId: FMCookie,
    });
    await auswertung.save();
  }
  await auswertung(FMCookie);
}

async function auswertungSummieren(FMCookie) {
  //Finde alle Auswertung und summiere alle Elemente der Artikelliste auf
  let foundAuswertungen = await Auswertung.find({ flohmarktId: FMCookie });
  for (const auswertung of foundAuswertungen) {
    let sum = 0;

    for (const artikel of auswertung.artikel) {
      sum += artikel.preis;
    }

    auswertung.summe = sum;
    await auswertung.save();
  }
}

function etikettenMake(req, res) {
  const keys = [
    50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750,
    800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400,
    1450, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500,
    2600, 2700, 2800, 2900, 3000, 11111,
  ];
  const wieOft = Object.values(req.body);
  let zahlenArray = wieOft.map(function (x) {
    return parseInt(x, 10);
  });
  const vNo = zahlenArray[0];
  zahlenArray.shift();

  var wertAnzahlObjekt = {};
  keys.forEach((key, i) => (wertAnzahlObjekt[key] = zahlenArray[i]));

  const anzahlEtiketten = _.sum(zahlenArray);
  const seiten = Math.ceil(anzahlEtiketten / 6);
  console.log(wertAnzahlObjekt[11111]);
  let freieEtiketten = anzahlEtiketten % 6;
  if (wertAnzahlObjekt[11111] >= freieEtiketten) {
    wertAnzahlObjekt[11111] = wertAnzahlObjekt[11111] - freieEtiketten;
  }
  console.log(anzahlEtiketten);
  const doc = new PDFDocument({ size: "A4", autoFirstPage: false });
  doc.pipe(res);

  //doc.pipe(fs.createWriteStream("./file-table2.pdf"));
  doc.registerFont("Barcode Font", "public/fonts/barcodefont_alt.ttf");

  // Verkauefernummer

  const etiWidth = 175;
  const etiHeight = 115;
  const marginTB = 40;
  const marginLR = 35;
  //doc.fontSize(20).text(vNo, 90,45)

  // doc.fontSize(20).text(vNo, marginLR+62, 45+etiHeight*i)
  let l = 0;
  do {
    doc.addPage();
    let zeilenNochPlatz = 6;
    let naechsteReihe = 1;
    var i = 0;
    do {
      //Außenrahmen
      doc
        .lineWidth(1.8)
        .rect(marginLR, marginTB + etiHeight * i, etiWidth, etiHeight)
        .stroke();
      doc
        .lineWidth(1.8)
        .rect(
          etiWidth + marginLR,
          marginTB + etiHeight * i,
          etiWidth,
          etiHeight
        )
        .stroke();
      doc
        .lineWidth(1.8)
        .rect(
          2 * etiWidth + marginLR,
          marginTB + etiHeight * i,
          etiWidth,
          etiHeight
        )
        .stroke();
      //Innenrahmen 1
      doc
        .lineWidth(1)
        .rect(marginLR, marginTB + 22 + etiHeight * i, etiWidth, 22)
        .stroke();
      doc
        .lineWidth(1)
        .rect(etiWidth + marginLR, marginTB + 22 + etiHeight * i, etiWidth, 22)
        .stroke();
      doc
        .lineWidth(1)
        .rect(
          2 * etiWidth + marginLR,
          marginTB + 22 + etiHeight * i,
          etiWidth,
          22
        )
        .stroke();
      //Innenrahmen 2
      doc
        .lineWidth(1)
        .rect(marginLR, marginTB + 65 + etiHeight * i, etiWidth, 50)
        .stroke();
      doc
        .lineWidth(1)
        .rect(etiWidth + marginLR, marginTB + 65 + etiHeight * i, etiWidth, 50)
        .stroke();
      doc
        .lineWidth(1)
        .rect(
          2 * etiWidth + marginLR,
          marginTB + 65 + etiHeight * i,
          etiWidth,
          50
        )
        .stroke();

      i += 1;
    } while (i < 6);

    k = 0;

    let preisReihe = [11111, 11111, 11111, 11111, 11111, 11111];

    for (const [key, value] of Object.entries(wertAnzahlObjekt)) {
      if (naechsteReihe < 7) {
        if (value > 0) {
          if (value <= zeilenNochPlatz) {
            console.log("value <= zeilenNochPlatz");
            for (let index = 0; index < value; index++) {
              preisReihe[naechsteReihe - 1] = parseInt(key);
              wertAnzahlObjekt[key]--;
              //console.log("key value: " + key + "Value: "+ value);
              zeilenNochPlatz--;
              naechsteReihe++;
            }

            //console.log(preisReihe);
            //console.log(zeilenNochPlatz);
            //console.log("Value: " + key+" Zeilen platz: "+zeilenNochPlatz);
          } else if (zeilenNochPlatz > 0) {
            for (let index = 0; index < zeilenNochPlatz; zeilenNochPlatz--) {
              preisReihe[naechsteReihe - 1] = parseInt(key);
              wertAnzahlObjekt[key]--;
              naechsteReihe++;
            }
            console.log(
              "Noch " + zeilenNochPlatz + " Platz aber nicht genug für alle"
            );
          }
        }
      } else {
        //console.log("Wenn noch weitere Etiketten, dann neue Seite. ansonsten fertig");
      }
    }

    do {
      let j = 0;
      do {
        //das funktioniert
        doc
          .fontSize(19)
          .font("Helvetica")
          .text(vNo, marginLR + 65 + etiWidth * k, 45 + etiHeight * j);
        //wenn in der nächsten Zeile am Ende statt der 71 eine höhere Zahl steht,
        //zerschießt sich das rechts erstellte PDF
        doc
          .fontSize(15)
          .font("Helvetica")
          .text("Größe:", marginLR + 6 + etiWidth * k, 69 + etiHeight * j);
        j += 1;
      } while (j < 6);

      for (let index = 0; index < 6; index++) {
        if (preisReihe[index] != 11111) {
          console.log("jetzt");
          doc
            .fontSize(17)
            .text(
              String((preisReihe[index] / 100).toFixed(2)).replace(".", ",") +
              " €",
              100 + etiWidth * k,
              88 + 115 * index
            )
            .font("Helvetica");
        } else {
          doc
            .fontSize(15)
            .font("Helvetica")
            .text("Preis:", marginLR + 6 + etiWidth * k, 88 + 115 * index);
        }
      }

      for (let index = 0; index < 6; index++) {
        if (preisReihe[index] != 11111) {
          doc
            .fontSize(30)
            .font("Barcode Font")
            .text(
              "*" +
              String(vNo) +
              String(_.padStart(preisReihe[index], 4, "0")) +
              "*",
              60 + etiWidth * k,
              115 + 115 * index,
              {
                lineBreak: false,
              }
            );
        }
      }

      k += 1;
    } while (k < 3);
    l += 1;
  } while (l < seiten);
  // end and display the document in the iframe to the right

  doc.end();

  //A4 610*760
}

/* const pdf = async () => {
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream("./file-table.pdf"));
  doc.text("Hello, World!");
  doc.end();
  console.dir(doc);
  return await getStream.buffer(doc);
}; */

async function auswertungProVerkaeufer(req, res) {
  const preise = [
    50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750,
    800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400,
    1450, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500,
    2600, 2700, 2800, 2900, 3000,
  ];

  const doc = new PDFDocument({ size: "A4", autoFirstPage: false });
  doc.pipe(res);

  let foundAuswertungen = await Auswertung.find({
    flohmarktId: req.cookies.FMNr,
  }).sort("vNummer");

  for (const verkaeufer of foundAuswertungen) {
    let sammelarray = [];
    sammelarray.length = 0;

    let artikelListe = verkaeufer.artikel;

    artikelListe.sort(function (a, b) {
      return a.preis - b.preis;
    });
    let sortiertePreisliste = artikelListe.map(function (obj) {
      return obj.preis;
    });

    let sonderpreisarray = [...sortiertePreisliste];

    let ersterPreis = sortiertePreisliste[0];
    if (sortiertePreisliste.length > 0) {
      let erstesObjekt = {
        preis: ersterPreis,
        anzahl: 1,
        summe: ersterPreis,
      };
      sammelarray.push(erstesObjekt);
    }

    sortiertePreisliste = sortiertePreisliste.slice(1);

    for (eintrag of sortiertePreisliste) {
      let item = sammelarray.find((item) => item.preis === eintrag);
      if (item) {
        item.anzahl++;
        item.summe += item.preis;
      } else {
        let weiteresObjekt = {
          preis: eintrag,
          anzahl: 1,
          summe: eintrag,
        };
        sammelarray.push(weiteresObjekt);
      }
    }

    doc.addPage();
    doc
      .fontSize(17)
      .text(
        "VN: " +
        verkaeufer.vNummer +
        ", " +
        verkaeufer.vorname +
        " " +
        verkaeufer.nachname
      );
    doc.moveDown();
    doc.fontSize(10).text("");
    doc.fontSize(10).text("Preis", 80, 110);
    doc.moveDown();

    for (const eintrag of sammelarray) {
      doc
        .text(String((eintrag.preis / 100).toFixed(2)).replace(".", ",") + " €")
        .fontSize(10);
    }

    doc.fontSize(10).text("Anzahl", 170, 110);
    doc.moveDown();
    let gesamtAnzahl = 0;
    let anzahl = 0;
    for (const eintrag of sammelarray) {
      doc.text("x" + eintrag.anzahl).fontSize(10);
      gesamtAnzahl = gesamtAnzahl + eintrag.anzahl;
    }
    doc.moveDown();
    doc.moveDown();
    doc.fontSize(15).text(gesamtAnzahl, { underline: true });
    doc.fontSize(10).text("Summe", 260, 110, { width: 110, align: "right" });
    doc.moveDown();
    anzahl = 0;
    let gesamtsumme = 0;
    for (const eintrag of sammelarray) {
      doc
        .text(
          String(((eintrag.anzahl * eintrag.preis) / 100).toFixed(2)).replace(
            ".",
            ","
          ) + " €",
          { width: 110, align: "right" }
        )
        .fontSize(10);
      gesamtsumme = gesamtsumme + eintrag.anzahl * eintrag.preis;
    }
    doc.moveDown();
    doc.moveDown();
    doc
      .fontSize(15)
      .text(String((gesamtsumme / 100).toFixed(2)).replace(".", ",") + " €", {
        underline: true,
        width: 110,
        align: "right",
      });

    doc.fontSize(10).text("Preis", 80, 110);
    doc.moveDown();
  }
  //console.log(foundAuswertungen);

  doc.end();

  //A4 610*760
}
