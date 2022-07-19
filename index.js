const express = require('express')
const bodyParser = require('body-parser');
const crypto = require('crypto');
const {
    MongoClient,
    ServerApiVersion
} = require('mongodb');
const uri = `mongodb+srv://lks-jawa-barat-garut:${process.env.MONGODB_PASSWORD}>@cluster0.kg9qcxj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});

const app = express()
app.use(bodyParser.urlencoded({
    extended: true
}));


const databaseAuth = {

};

const databaseToken = {

};

function randomToken() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password) {
    // Creating a unique salt for a particular user 
    const salt = randomToken();

    // Hashing user's salt and password with 1000 iterations, 

    const hash = crypto.pbkdf2Sync(password, salt,
        1000, 64, `sha512`).toString(`hex`);
    return {
        "salt": salt,
        "hash": hash
    };
}

async function passwordValid(user, pass) {
    client.connect(url, function(err, db) {
        if (err) throw err;
        var dbo = db.db("mydb");
        dbo.collection("customers").findOne({}, function(err, result) {
          if (err) throw err;
          console.log(result.name);
          db.close();
        });
      });
    if (!(user in databaseAuth)) {
        throw {
            "error": "user.not.exists"
        }
    }
    const auth = databaseAuth[user];
    const salt = auth.salt;
    const actualHash = auth.password;
    const hash = crypto.pbkdf2Sync(pass, salt, 1000, 64, `sha512`).toString(`hex`);
    return hash === actualHash;
}

app.get('/', function (req, res) {
    res.send({
        'name': "test"
    });
})

app.post("/auth/register", function (req, res) {
    console.log('Got body:', req.body);
    if (req.body.username && req.body.password && req.body.alamat && req.body.namaLengkap) {
        if (req.body.username in databaseAuth) {
            res.status(400);
            return res.send({
                "error": "Username exists"
            });
        }
        const username = req.body.username;
        const password = req.body.password;
        const hashF = hashPassword(password);
        const salt = hashF.salt;
        const hashedPass = hashF.hash;
        const auth = {
            "salt": salt,
            "password": hashedPass,
            "alamat": req.body.alamat,
            "namaLengkap": req.body.namaLengkap
        };
        client.connect(process.env.MONGODB_DATABASE, function (err, db) {
            if (err) throw err;
            var dbo = db.db(process.env.MONGODB_DATABASE);
            dbo.collection("customers").insertOne(myobj, function (err, res) {
                if (err) throw err;
                console.log("1 document inserted");
                db.close();
            });
        });
        const token = randomToken();
        databaseToken[username] = token;
        return res.send({
            "token": token
        });
    }
    res.status(400);
    return res.send({
        "error": "Invalid Body"
    });
});



app.post("/auth/login", function (req, res) {
    console.log('Got body:', req.body);
    if (req.body.username && req.body.password) {
        try {
            if (passwordValid(req.body.username, req.body.password)) {
                return res.send({
                    "token": databaseToken[req.body.username]
                });
            }
        } catch (e) {
            res.status(400);
            return res.send(e);
        }
        res.status(401);
        return res.send({
            "error": "Invalid Password"
        });
    }
    res.status(400);
    return res.send({
        "error": "Invalid Body"
    });
})
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
  });