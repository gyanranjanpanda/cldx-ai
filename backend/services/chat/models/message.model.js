import mongoose from "mongoose";

const mixedSchema =
mongoose.Schema.Types.Mixed;

const fileSchema =
new mongoose.Schema({

  name:String,

  content:String,

  url:String,

  mimeType:String,

  size:Number

},{
  _id:false
});

const artifactSchema =
new mongoose.Schema({

  id:Number,

  type:String,

  title:String,

  url:String,

  mimeType:String,

  preview:mixedSchema,

  manifest:mixedSchema,

  files:[fileSchema],

  createdAt:String

},{
  _id:false
});

const messageSchema =
new mongoose.Schema({

  conversationId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Conversation"
  },

  role:{
    type:String,
    enum:[
      "user",
      "assistant"
    ]
  },

  content:String,
  images:[String],

  artifacts:[artifactSchema]

},{
  timestamps:true
});

const Message =
mongoose.model(
  "Message",
  messageSchema
);

export default Message;
