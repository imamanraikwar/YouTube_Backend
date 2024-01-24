import { asyncHandler } from "../utils/asyncHandler.js";
import { options } from "../constants.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

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

export { registerUser, loginUser, logoutUser, refreshAccessToken };
