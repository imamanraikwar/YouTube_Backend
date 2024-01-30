import { asyncHandler } from "../utils/asyncHandler.js";
import { options } from "../constants.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (user) => {
  try {
    //const user = await User.findById(userId);
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong when generating access and refresh token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //get the data from the user
  // check all required data validation
  // check the user name and email is unique or not
  // upload the avatar image
  // create user object - create entry in db
  const { username, email, fullName, password } = req.body;

  if (
    [username, email, fullName, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "Please fill the required field");
  }

  // check the username and email is unique or not

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with username or email already exist");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  //upload them to cloudinary
  const avatarResponse = await uploadOnCloudinary(avatarLocalPath);
  const coverImageResponse = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatarResponse) {
    throw new ApiError(5001, "Avatar image not uploaded successfully");
  }

  // create user data

  const user = await User.create({
    username: username.toLowerCase(),
    email,
    fullName,
    password,
    avatar: avatarResponse.url,
    coverImage: coverImageResponse?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong when register the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

//login user

const loginUser = asyncHandler(async (req, res) => {
  //check the validation and get the field username
  //find the user associated to user credential
  // check the password using bcrypt password
  // generate the access token and the refresh token
  // send the response message
  const { username, email, password } = req.body;
  if (!(username || email)) {
    throw new ApiError(401, "username or email is required");
  }

  const checkUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!checkUser) {
    throw new ApiError(404, "User is not found");
  }

  const isPasswordValid = await checkUser.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(checkUser);

  const user = await User.findById(checkUser._id).select(
    "-password -refreshToken"
  );

  // const options = {
  //   httpOnly: true,
  //   secure: true,
  // };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user,
          accessToken,
          refreshToken,
        },
        "User logged In successfully"
      )
    );
});

//logoutUser

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  // const options = {
  //   httpOnly: true,
  //   secure: true,
  // };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.registerUser;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id).select("-password");

    if (!user.refreshToken == incomingRefreshToken) {
      throw new ApiError(401, "Unauthorize Access");
    }

    const { accessToken, refreshToken } =
      await generateAccessAndRefreshToken(user);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(new ApiResponse(200, "AccessToken refreshed successfully"));
  } catch (error) {
    throw new ApiError(
      "404",
      error?.message || "Something went wrong while refresh the Access token"
    );
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  try {
    const { password, newPassword } = req.body;
    console.log("Password----", password, "New Password", newPassword);
    if (!password || !newPassword) {
      throw new ApiError(402, "All field are required");
    }

    const user = await User.findById(req?.user._id);
    console.log();

    if (!user) {
      throw new ApiError(401, "User not loggedIn");
    }

    const checkPassword = await user.isPasswordCorrect(password);
    if (checkPassword == false) {
      throw new ApiError(402, "your old password is not correct");
    }

    user.password = newPassword;
    await user.save();

    return res
      .status(200)
      .json(new ApiResponse(201, "Password is change successfully"));
  } catch (error) {
    throw new ApiError(501, error.message || "Something went wrong");
  }
});

const getUserDetails = asyncHandler(async (req, res) => {
  console.log("In get User Controller");
  try {
    const user = req.user;
    if (!user) {
      throw new ApiError(401, "Unauthorize access");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user, "Get user details successfully"));
  } catch (error) {
    throw new ApiError(404, error.message || "Something went wrong");
  }
});

const updateUserProfile = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(401, "All filed are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select("-password");

  if (!user) {
    throw new ApiError(401, "Unauthorized Access");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "User Profile updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  console.log(req.files);
  const avatarLocalPath = req.files?.avatar[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(405, "File not found");
  }

  const avatarPath = await uploadOnCloudinary(avatarLocalPath);
  if (!avatarPath.url) {
    throw new ApiError(501, "Profile not updated");
  }

  await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatarPath?.url,
      },
    },
    { new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  console.log(req.file);
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(405, "File not found");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!coverImage.url) {
    throw new ApiError(501, "Cover Image not updated");
  }

  await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: coverImage?.url,
      },
    },
    { new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "coverImage updated successfully"));
});

const getChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "User not found");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscriberCount: {
          $size: "subscribers",
        },
        channelSubscriberToCount: {
          $size: "subscribedTo",
        },
        isSubscribed: {
          $cond: { $in: [req.user?._id, "$subscribers.subscriber"] },
          then: true,
          else: false,
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscriberCount: 1,
        channelSubscriberToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "Channel does not exits");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(400, "User not login");
  }
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history get successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getUserDetails,
  updateUserProfile,
  updateUserAvatar,
  updateUserCoverImage,
  getChannelProfile,
  getWatchHistory,
};
