import { Router } from "express";
import {
  loginUser,
  logoutUser,
  registerUser,
  refreshAccessToken,
  changeCurrentPassword,
  getUserDetails,
  updateUserProfile,
  updateUserAvatar,
  updateUserCoverImage
  
} from "../controllers/user.controller.js";

import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);

//secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refreshAccessToken").post(refreshAccessToken);
router.route("/change-current-password").post(verifyJWT, changeCurrentPassword);
router.route("/getUserDetails").get(verifyJWT,getUserDetails)
router.route("/updateUserProfile").post(verifyJWT,updateUserProfile)
router.route("/updateUserAvatar").post(verifyJWT,
  upload.fields(
    [{
      name:"avatar",
      maxCount:1
    }]
),
  updateUserAvatar)

  router.route("/updateUserCoverImage").post(verifyJWT,
  upload.single("coverImage"),
  updateUserCoverImage)

export default router;
