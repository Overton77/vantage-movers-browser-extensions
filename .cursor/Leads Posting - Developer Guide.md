**Leads Posting Gateway**  
**Developer Guide**  
Last Revised 03-09-2026  
** **  
**Introduction**  
** **  
Welcome to the GRANOT INC Leads Posting Gateway Developer Guide. This guide describes the requirements needed to integrate a Form Fill on a website, landing page or application with the GRANOT INC Posting Gateway to post moving leads for direct distribution or to sell in GRANOT INCs’ Leads Marketplace. 

Lead Providers with an API or active clients can integrate and control the steps in distributing a lead, including:  
·      Capturing the lead data at the Gateway level (HTTP or XML)  
·      lead distribution directly to a designated client

Lead posting transaction is required through a 128-bit Secure Sockets Layer (SSL) and HTTP/1.1 or HTTP/2.0 protocol between the Lead Provider’s web server or website and the Leads Posting Gateway.  
For any questions you can email [info@granot.com](mailto:info@granot.com) and our support team will reply promptly.

**Submitting Leads**  
   
The Leads Posting Gateway application programming interface (API) consists of required fields (introduced in the following tables) and additional optional fields that can be submitted for real-time lead distribution.  
   
**Field names, required and optional, for posting a lead to the Leads Gateway:**

| FIELD NAME | VALUE DESCRIPTION | STRUCTURE and TYPE | NOTES |
| :---- | :---- | :---- | :---- |
| servtypeid | 101 \- Local Move 102 \- Long Distance Move 103 \- Auto Transport 104 \- International Move | Integer | HTTP – Optional XML \- Mandatory |
| leadno | LeadID, SubID or ClickId from the provider | 100 Characters | Optional |
| firstname | Client's First Name | 30 Characters | Optional when the full name is in a single string |
| lastname | Client's Last Name  | 30 Characters | Optional when the full name is in a single string |
| oaddr | Origin address | 70 Characters | Optional if origin address is provided |
| ocity | origin city- 'from city' | 30 Characters | Optional if origin zip code is provided |
| ostate | origin state \- 'from state' | 20 Characters | Optional if origin zip code is provided. State Abbreviation (NY) |
| ozip | origin zip code- 'from zip' | 6 Characters | Optional when city and state are provided |
| ocountry | origin country | 20 Characters | Only for International leads (104) |
| daddr | Destination address | 70 Characters | Optional if destination address is provided |
| dcity | destination city \- 'to city' | 20 Characters | Optional if destination zip code is provided |
| dstate | destination state \- 'to state' | 20 Characters | Optional if destination zip code is provided. State Abbreviation (TX) |
| dzip | destination zip code- 'to zip' | 6 Characters | Optional when city and state are provided |
| dcountry | destination country | 20 Characters | Only for International leads (104) |
| volume | Cubic Feet | Integer |  |
| weight | Pounds | Integer |  |
| movesize | move size description | 20 Characters | Studio 1500 LBS, One bedroom 2800 LBS, Two Bedrooms 3200 LBS... |
| movedte | Expected Move Date | HTTP \- 10 Characters MM/DD/YYYY XML – Date time | Mandatory |
| email | client contact email | 50 Characters | Optional but recommended |
| phone1 |  | 20 Characters | Optional but recommended |
| phone2 |  | 20 Characters | Optional |
| cell |  | 20 Characters | Optional |
| consent | 1 – Yes 0 \- No |  | Optional. Customer consent to receive emails and SMS |
| moverref | Leads email key provided by the mover to post leads directly to the mover’s account. |  | Optional on the data string if provided on the Post URL. |
| label | Lead reference / source . | 20 Characters | Optional |
| notes | Any additional information | Max characters | Optional. Notes populates as customer remarks. |
| redirurl | Redirect HTTP posted form to a ‘thank-u-page.htm’ | 70 Characters | Optional |

**Service Type ID per Type of Move:**

| Lead Type | Service Type ID (servtypeid) |
| :---- | :---- |
| Local Move | 101 |
| Long Distance Move | 102 |
| Auto Transport | 103 |
| International Move | 104 |

**Auto Transport (servicetypeid=103):**  The Gateway can capture up to three different vehicles in a lead post.

| FIELD NAME | VALUE DESCRIPTION | STRUCTURE and TYPE | NOTES |
| :---- | :---- | :---- | :---- |
| make0 | vehicle Make | 20 Characters | Toyota |
| model0 | vehicle Model | 20 Characters | Corolla |
| year0 | vehicle Year | 20 Characters | 2009 |
| autotype0 | vehicle auto type | 20 Characters | Sedan |
| running0 | 1 – Yes 0 \- No | HTTP – 1 Character XML \- Integer |  |
| cover0 | 1 – Yes 0 \- No | HTTP – 1 Character XML \- Integer |  |
| color0 |  | 20 Characters | Black |
| engine0 |  | 20 Characters | Gas, Hybrid,Electric |
| vin0 | Vin number | 20 Characters |  |
| dlvtype0 | Delivery type | 20 Characters | Land, ocean |
| autonotes0 | Vehicle notes | 100 Characters | Large bumper |
| make1 |   |   |   |
| model1 |   |   |   |
| year1 |   |   |   |
| autotype1 |   |   |   |
| running1 |   |   |   |
| cover1 |  |  |  |
| color1 |  | 20 Characters | Black |
| engine1 |  | 20 Characters | Gas, Hybrid,Electric |
| vin1 | Vin number | 20 Characters |  |
| dlvtype1 | Delivery type | 20 Characters | Land, ocean |
| autonotes1 | Vehicle notes | 100 Characters | Large bumper |

\* All numeric indexes are zero relative (first make:make0, second make:make1, third make: make2)

**Important:** do not include the fields on the Post URL. Only the API\_ID and MOVERREF.

**Direct Lead Post URL**

The mover will provide his leads email key (MOVERREF). It has to match the email the mover set up in his software account.

**Provider’s API ID and protocols**  
The lead provider’s API ID (12 characters) provided must be stored securely.  
The API ID is an authentication key and it is required for leads posting. The API ID is part of the URL string (using the GET method).

**Post URL for a demo account:** https://[lead.hellomoving.com](http://lead.hellomoving.com/)/LEADSGWHTTP.lidgw?\&API\_ID=E432CD67C51E\&MOVERREF=test@granot.com

**Protocols**

The Leads Posting Gateway supports three protocols of data; HTTP, XML low level, and XML DTD.  
·      HTTP \- simple post of a form. Usually posted directly from the Web site's form using the post method.  
·      XML (low level) \- simple structure with xml elements and tags which contains the leads information.  
·      XML DTD \- Also known as XML High Level. It is a predefined document that contains both the data definition types and the leads information.

Auto Transport Post URL supports only HTTP protocol.

**Transaction Response**  
   
The transaction response from the leads posting gateway provides the **LEADID** and the information about the status of a transaction; Error ID and Error Description.  
   
There are two formats of the Leads Posting Gateway response string:  
   
·   HTTP – returning a delimited string  
·   XML  – returning an XML low level string

**Immediate Response**

| HTTP Response Example | XML Response Example |
| ----- | ----- |
| **104360,13,missing client name,0,6 or 104360,0,OK,6,6** | \<?xml version="1.0"?\> \-  \<AAA\>    \-  \<BBB\>           \<leadid\>**104360**\</leadid\>           \<errid\>**13**\</errid\>           \<msg\>**missing client name**\</msg\>           \<sold\>**0**\</sold\>           \<match\>**6**\</match\>       \</BBB\>    \</AAA\> |

   
**Error Message Codes**

| ERRID | MSG |
| :---- | :---- |
| 0 | OK (no errors) |
| 11 | Missing provider's API\_ID |
| 12 | Provider's reference does not exist in the system |
| 13 | Inactive provider |
| 15 | Duplicate Lead (customer email and MOVERREF) |
| 24 | Empty post |

