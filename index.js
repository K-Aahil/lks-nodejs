const express = require('express')
const bodyParser = require('body-parser');
const crypto = require('crypto');
const easyinvoice = require('easyinvoice');
require('dotenv').config();
const {
    MongoClient,
    ServerApiVersion, ObjectId
} = require('mongodb');
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.log("MONGODB_URI not set");
    process.exit(1);
}
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});

const app = express()
app.use(bodyParser.urlencoded({
    extended: true
}));


async function randomToken(username) {
    //check in database if user already exists
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('token');
    const token = await collection.findOne({
        username: username
    });
    await connect.close();
    if (token) {
        return token.token;
    }
    const tokenGenerated = crypto.randomBytes(32).toString(`hex`);
    const tokenInserted = await collection.insertOne({
        username: username,
    });
    if (!tokenInserted.insertedId) {
        throw {
            "error": "token.not.inserted"
        }
    }
    return tokenGenerated;
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
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('auth');
    const auth = await collection.findOne({
        username: user
    });
    await connect.close();
    if (!auth) {
        throw {
            "error": "user.not.exists"
        }
    }
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

app.post("/auth/register", async function (req, res) {
    console.log('Got body:', req.body);
    if (req.body.username && req.body.password && req.body.alamat && req.body.namaLengkap) {
        //check in database if user already exists

        const username = req.body.username;
        const password = req.body.password;
        const hashF = hashPassword(password);
        const salt = hashF.salt;
        const hashedPass = hashF.hash;
        const auth = {
            "salt": salt,
            "password": hashedPass,
            "alamat": req.body.alamat,
            "nama.lengkap": req.body.namaLengkap,
            "username": username
        };
        const connection = await client.connect();
        const db = await connection.db(process.env.MONGODB_DATABASE);
        const collection = await db.collection("auth");
        //check if exist
        const result = await collection.findOne({
            "username": username
        });
        if (result) {
            res.status(400);
            return res.send({
                "error": "Username exists"
            });
        }
        const me = await collection.insertOne(auth);
        if (!result.acknowledged) {
            res.status(400);
            return res.send({
                "error": "Username exists"
            });
        }
        const token = randomToken(username);

        return res.send({
            "token": token
        });
    }
    res.status(400);
    return res.send({
        "error": "Invalid Body"
    });
});
app.post("/auth/login", async function (req, res) {
    console.log('Got body:', req.body);
    if (req.body.username && req.body.password) {
        try {
            if (await passwordValid(req.body.username, req.body.password)) {
                return res.send({
                    "token": await randomToken(req.body.username)
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


//guarded route
/*
app.use(async function (req, res, next) {
    if (req.headers.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        const connect = await client.connect();
        const db = connect.db(process.env.MONGODB_DATABASE);
        const collection = db.collection('token');
        const tokenFound = await collection.findOne({
            token: token
        });
        await connect.close();
        if (tokenFound) {
            req.username = tokenFound.username;
            next();
        } else {
            res.status(401);
            return res.send({
                "error": "Invalid Token"
            });
        }
    } else {
        res.status(401);
        return res.send({
            "error": "Invalid Token"
        });
    }
});
*/

//get user info, remove auth info
app.get("/auth/info", async function (req, res) {
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('auth');
    const auth = await collection.findOne({
        username: req.username
    });
    await connect.close();
    if (auth) {
        delete auth.salt;
        delete auth.password;
        return res.send(auth);
    }
    res.status(400);
    return res.send({
        "error": "user.not.exists"
    });
});

//get drugs list
app.get("/drugs", async function (req, res) {
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('drugs');
    const drugs = await collection.find().toArray();
    await connect.close();
    if (drugs) {
        return res.send(drugs);
    }
    res.status(400);
    return res.send({
        "error": "drugs.not.exists"
    });
});

//get drug info

async function getDrugs(id) {
    if (!id) {
        return;
    }
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('drugs');
    const drug = await collection.findOne({
        id: id
    });
    await connect.close();
    return drug;
}

app.get("/drugs/:id", async function (req, res) {
    const drug = await getDrugs(req.params.id);
    if (drug) {
        return res.send(drug);
    }
    res.status(400);
    return res.send({
        "error": "drug.not.exists"
    });
});


const validDrugType = ["tablet", "syrup"];
app.post("/transaction", async function (req, res) {
    console.log('Got body:', req.body);
    //drugs list, drug type, patient name
    //store to transaction collection

    //verify data type
    if (typeof req.body.drugs !== "object") {
        for (let i = 0; i < req.body.drugs.length; i++) {
            if (typeof req.body.drugs[i] !== "object") {
                res.status(400);
                return res.send({
                    "error": "invalid.field",
                    "field": `drugs[${i}]`
                });
            }
            if (!req.body.drugs[i].id) {
                res.status(400);
                return res.send({
                    "error": "invalid.field",
                    "field": `drugs[${i}].id`
                });
            }
            if (!req.body.drugs[i].quantity) {
                res.status(400);
                return res.send({
                    "error": "invalid.field",
                    "field": `drugs[${i}].quantity`
                });
            }
        }
        res.status(400);
        return res.send({
            "error": "invalid.field",
            "field": "drugs"
        });
    }

    if (typeof req.body.drugType !== "string" || validDrugType.indexOf(req.body.drugType) === -1) {
        res.status(400);
        return res.send({
            "error": "invalid.field",
            "field": "drugType"
        });
    }

    if (typeof req.body.patientName !== "string") {
        res.status(400);
        return res.send({
            "error": "invalid.field",
            "field": "patientName"
        });
    }
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('transaction');
    const transaction = {
        drugs: req.body.drugs,
        drugType: req.body.drugType,
        patientName: req.body.patientName,
        username: req.username
    }
    const result = await collection.insertOne(transaction);
    await connect.close();
    if (!result.acknowledged) {
        res.status(400);
        return res.send({
            "error": "transaction.failed"
        });
    }
    return res.send({
        "success": "transaction.success",
        "transactionId": result.insertedId
    });

});

async function getTransaction(id) {
    if (id === undefined) {
        return null;
    }
    const connect = await client.connect();
    const db = connect.db(process.env.MONGODB_DATABASE);
    const collection = db.collection('transaction');
    const transaction = await collection.findOne({
        _id: ObjectId(id)
    });
    //resolve drugs
    for (let i = 0; i < transaction.drugs.length; i++) {
        transaction.drugs[i].data = await getDrugs(transaction.drugs[i].id);
    }
    await connect.close();
    return transaction;
}

app.get("/transaction/:id", async function (req, res) {
    console.log('Got body:', req.body);
    //drugs list, drug type, patient name
    //store to transaction collection
    if (req.params.id) {
        const transaction = await getTransaction(req.params.id);
        if (transaction) {
            return res.send(transaction);
        }
        res.status(404);
        return res.send({
            "error": "transaction.not.exists"
        });
    }
    res.status(400);
    return res.send({
        "error": "invalid.field",
        "field": "transactionId"
    });
});

//get invoice
async function generatePDFInvoice(id) {
    //const transaction = await getTransaction(id);
    //if (!transaction) {
    //    throw new Error("transaction.not.exists");
    // }
    const data = {

        // Your recipient
        "client": {
            "company": "Client Corp",
            "address": "Clientstreet 456",
            "zip": "4567 CD",
            "city": "Clientcity",
            "country": "Clientcountry"
            // "custom1": "custom value 1",
            // "custom2": "custom value 2",
            // "custom3": "custom value 3"
        },
        "information": {
            // Invoice number
            "number": "2021.0001",
            // Invoice data
            "date": "12-12-2021",
            // Invoice due date
            "due-date": "31-12-2021"
        },
        // The products you would like to see on your invoice
        // Total values are being calculated automatically
        "products": [
            {
                "quantity": 2,
                "description": "Product 1",
                "price": 33.87,
                "tax-rate": 0
            },
            {
                "quantity": 4.1,
                "description": "Product 2",
                "price": 12.34,
                "tax-rate": 0
            },
            {
                "quantity": 4.5678,
                "description": "Product 3",
                "price": 6324.453456,
                "tax-rate": 0
            }
        ],
        // Settings to customize your invoice
        "settings": {
            "currency": "IDR", // See documentation 'Locales and Currency' for more info. Leave empty for no currency.
            // "locale": "id_ID", // See documentation 'Locales and Currency' for more info. Leave empty for no locale.
            "tax-notation": "PPN",
            // "margin-top": 25, // Defaults to '25'
            // "margin-right": 25, // Defaults to '25'
            // "margin-left": 25, // Defaults to '25'
            // "margin-bottom": 25, // Defaults to '25'
            // "format": "A4", // Defaults to A4, options: A3, A4, A5, Legal, Letter, Tabloid
            // "height": "1000px", // allowed units: mm, cm, in, px
            // "width": "500px", // allowed units: mm, cm, in, px
            // "orientation": "landscape", // portrait or landscape, defaults to portrait
        },
        // Translate invoice to your indonesian language
        "translate": {
            "number": "No",
            "date": "Tanggal",
            "due-date": "Jatuh Tempo",
            "subtotal": "Subtotal",
            "products": "Produk",
            "quantity": "Jumlah",
            "price": "Harga",
            "product-total": "Total Produk",
            "total": "Total",
        }
    };
    //insert product data from transaction.drugs
    /*
    for(let i = 0; i < transaction.drugs.length; i++){
        data.products[i].description = transaction.drugs[i].data.name;
        data.products[i].price = transaction.drugs[i].data.price;
        data.products[i].quantity = transaction.drugs[i].quantity;
    }

     */
    const invoice = await easyinvoice.createInvoice(data);
    return invoice;
}

app.get("/invoice/:id", async function (req, res) {
    console.log('Got body:', req.body);
    //drugs list, drug type, patient name
    //store to transaction collection
    if (req.params.id) {
        try {
            const invoice = await generatePDFInvoice(req.params.id);
            if (invoice) {
                const buf = Buffer.from(invoice.pdf, 'base64');
                //its a pdf
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Length', buf.length);
                res.setHeader('Content-Disposition', 'inline; filename=${invoice.number}.pdf');
                return res.send(buf);
            }
        } catch (error) {
            res.status(400)
            return res.send({
                "error": error.message
            });
        }
    }
    res.status(400);
    return res.send({
        "error": "invalid.field",
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});
