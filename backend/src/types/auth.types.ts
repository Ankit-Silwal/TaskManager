export interface RegisterInput{
  name:string,
  email:string,
  password:string
}

export interface LoginInput{
  email:string,
  password:string
}

export interface PublicUser{
  id:string,
  email:string,
  isActive:boolean,
  createdAt:Date,
  updatedAt:Date
}

export interface AccessTokenPayLoad{
  sub:string,
  email:string
}

export interface AuthTokens{
  accessToken:string,
  refreshToken:string,
  refreshExpiredAt:Date
}

export interface SessionMeta{
  userAgent:string|null;
  ipAddress:string|null
}