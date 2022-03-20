const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Profile = require("../models/Profile");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const fetchuser = require("../middleware/fetchuser");
const nodemailer = require("nodemailer");

dotenv.config({ path: "./.env" });

const JWT_SECRET = process.env.JWT_SECRET;

//Route 1: Create a user using: POST /api/auth/createuser.no login required
router.post(
  "/createuser",
  [
    body("email").isEmail(),
    body("userName", "Enter a Valid Name").isLength({ min: 2 }), //body(type,msg)
    body("password", "Password must be 5 character long").isLength({ min: 5 }),
  ],
  async (req, res) => {
    let success = false;
    //if there are errors, send bad request with error
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success, errors: errors.array() });
    }

    try {
      //check whether a user with this email already exists
      let user = await User.findOne({ email: req.body.email });
      if (user) {
        return res.json({ success, error: "Enter a Unique Email" });
      }

      //password hashing
      const salt = await bcrypt.genSalt(10);
      const secPass = await bcrypt.hash(req.body.password, salt);

      //create a new user. await returns the resolved promise in this case the document created
      user = await User.create({
        userName: req.body.userName,
        email: req.body.email,
        password: secPass,
      });
      //create a new profile for the user

      await Profile.create({
        user: user.id,
        userName: req.body.userName,
        email: req.body.email,
        phone: req.body.phoneNumber,
        address: req.body.address,
        country: req.body.country,
        fullName: req.body.fullName,
        bvn: req.body.bvn,
        gender: req.body.gender,
        dateOfBirth: req.body.dateOfBirth,
      });

      //pass this data in JWT data part
      const data = {
        user: {
          id: user.id,
        },
      };

      //create and sign token
      const authToken = jwt.sign(data, JWT_SECRET); //returns the JWT string (3 parts.2nd data.3rd signature)

      //res.json(user) do not send the user back;
      //send the token back
      success = true;
      res.json({ success, authToken });
    } catch (err) {
      console.log(err.message);
      res.status(500).send("Internal Server Error");
    }

    //   .then(user => res.json(user))
    //   .catch(err=>{
    //       console.log(err);
    //       return res.json({error: 'Enter a Unique Email', message: err.message});
    //   });
  }
);

//Route 2:Authenticate a user using: POST 'api/auth/login'. No login required
router.post(
  "/login",
  [
    body("email", "Enter a valid email").isEmail(),
    body("password", "Password cannot be blank").exists(),
  ],
  async (req, res) => {
    //if there are errors, send bad request with error
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    //email and pass from login end point entered
    const { email, password } = req.body;
    try {
      //To check email exists
      let user = await User.findOne({ email });
      let success;
      if (!user) {
        success = false;
        return res
          .status(400)
          .json({ error: "Login with correct credentials" });
      }
      //verify password
      const passwordCompare = await bcrypt.compare(password, user.password); // return boolean
      if (!passwordCompare) {
        success = false;
        return res
          .status(400)
          .json({ success, error: "Login with correct credentials" });
      }
      //this is what to send user back if all is good in token
      const data = {
        user: {
          id: user.id,
        },
      };

      //same as route1
      const authToken = jwt.sign(data, JWT_SECRET);
      success = true;
      user.password = undefined;
      res.json({ success, authToken, user });
    } catch (err) {
      console.log(err.message);
      res.status(500).send("Internal Server Error");
    }
  }
);

//Route 3:Get logged in user details using: POST 'api/auth/getuser'.login required
router.post("/getuser", fetchuser, async (req, res) => {
  try {
    const userId = req.body.userId;
    const user = await Profile.findOne({ user: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (err) {
    console.log(err.message);
    res.status(500).send("Internal Server Error, getUser");
  }
});

router.post("/forgotpassword", async (req, res) => {
  try {
    const email = req.body.email;
    let user1 = await User.find({ email });
    if (!user1) {
      return res.json({ success: false, message: "Invalid Credentials" });
    }

    function generatePassword() {
      var length = 8,
        charset =
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        retVal = "";
      for (var i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
      }
      return retVal;
    }

    const newPassword = generatePassword();

    //Step 1 need transported-->connect to host domain
    let transporter = nodemailer.createTransport({
      service: "gmail", //a way of saying we want to connect to gmail
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    //Step 2 what to send to mail
    let mailOptions = {
      from: "scholarshipvine@gmail.com",
      to: "ch.arham1220@gmail.com",
      subject: "Password Reset",
      text: `Your New Password Is:\n${newPassword}`,
    };

    // Step 3
    transporter.sendMail(mailOptions, async (err, data) => {
      if (err) {
        console.log("Error:", err.message);
      } else {
        console.log("Email sent");
        //password hashing
        const salt = await bcrypt.genSalt(10);
        const secPass = await bcrypt.hash(newPassword, salt);
        user1 = await User.findByIdAndUpdate(
          user1._id,
          { password: secPass },
          { new: true }
        );
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err.message);
    res.status(500).send("Internal Server Error, forgotPassword");
  }
});

module.exports = router;
