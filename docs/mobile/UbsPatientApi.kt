package br.com.ubsconecta.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable data class ApiData<T>(val data: T)
@Serializable data class ApiPage<T>(val data: List<T>, val pagination: Pagination)
@Serializable data class Pagination(
    val page: Int,
    @SerialName("page_size") val pageSize: Int,
    @SerialName("has_more") val hasMore: Boolean,
)
@Serializable data class ApiErrorBody(val error: ApiError)
@Serializable data class ApiError(val code: String, val message: String, val fields: List<FieldError>? = null)
@Serializable data class FieldError(val path: String, val message: String)
@Serializable data class LoginInput(val email: String, val password: String)
@Serializable data class RegisterInput(
    val name: String,
    val document: String,
    @SerialName("birth_date") val birthDate: String,
    val neighborhood: String,
    val email: String,
    val password: String,
    val phone: String = "",
)
@Serializable data class ProfileInput(
    val name: String? = null,
    val document: String? = null,
    @SerialName("birth_date") val birthDate: String? = null,
    val phone: String? = null,
    val neighborhood: String? = null,
)
@Serializable data class ReservationInput(@SerialName("slot_id") val slotId: String)
@Serializable class EmptyInput
@Serializable data class RegisteredUser(val id: String)
@Serializable data class PatientUser(val id: String, val name: String, val email: String, val role: String)
@Serializable data class PatientProfile(
    val id: String, val name: String, val document: String,
    @SerialName("birth_date") val birthDate: String,
    val phone: String, val neighborhood: String, val area: String,
    @SerialName("acs_name") val acsName: String?,
)
@Serializable data class Me(val user: PatientUser, val patient: PatientProfile)
@Serializable data class PatientSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Int,
    @SerialName("expires_at") val expiresAt: String,
    val user: PatientUser,
)
@Serializable data class Service(val id: String, val name: String)
@Serializable data class Slot(
    val id: String,
    @SerialName("service_id") val serviceId: String,
    @SerialName("service_name") val serviceName: String,
    @SerialName("professional_name") val professionalName: String,
    val date: String, val period: String,
    @SerialName("starts_at") val startsAt: String,
    val capacity: Int, val available: Int,
)
@Serializable data class Ticket(
    val id: String, val number: Long,
    @SerialName("slot_id") val slotId: String,
    val status: String,
    @SerialName("service_name") val serviceName: String,
    @SerialName("professional_name") val professionalName: String,
    val date: String, val period: String,
    @SerialName("starts_at") val startsAt: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("can_cancel") val canCancel: Boolean,
)
@Serializable data class Vaccination(
    val id: String,
    @SerialName("vaccine_name") val vaccineName: String,
    val dose: Int,
    @SerialName("applied_at") val appliedAt: String,
    @SerialName("lot_code") val lotCode: String,
    @SerialName("professional_name") val professionalName: String,
    @SerialName("campaign_name") val campaignName: String?,
)
@Serializable data class PendingVaccination(
    val id: String,
    @SerialName("vaccine_name") val vaccineName: String,
    @SerialName("due_date") val dueDate: String,
    val done: Boolean,
)
@Serializable data class Visit(
    val id: String, val date: String, val status: String,
    @SerialName("acs_name") val acsName: String,
)

interface UbsPatientApi {
    @POST("auth/register") suspend fun register(@Body input: RegisterInput): Response<ApiData<RegisteredUser>>
    @POST("auth/login") suspend fun login(@Body input: LoginInput): Response<ApiData<PatientSession>>
    @POST("auth/logout") suspend fun logout(@Body input: EmptyInput = EmptyInput()): Response<Unit>
    @GET("me") suspend fun me(): Response<ApiData<Me>>
    @PATCH("me") suspend fun updateMe(@Body input: ProfileInput): Response<ApiData<Me>>
    @GET("services") suspend fun services(@Query("page") page: Int = 1, @Query("page_size") pageSize: Int = 20): Response<ApiPage<Service>>
    @GET("slots") suspend fun slots(
        @Query("service_id") serviceId: String? = null,
        @Query("date_from") dateFrom: String? = null,
        @Query("date_to") dateTo: String? = null,
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20,
    ): Response<ApiPage<Slot>>
    @GET("tickets") suspend fun tickets(@Query("status") status: String? = null, @Query("page") page: Int = 1, @Query("page_size") pageSize: Int = 20): Response<ApiPage<Ticket>>
    @GET("tickets/{id}") suspend fun ticket(@Path("id") id: String): Response<ApiData<Ticket>>
    @POST("reservations") suspend fun reserve(@Header("Idempotency-Key") key: String, @Body input: ReservationInput): Response<ApiData<Ticket>>
    @POST("tickets/{id}/cancel") suspend fun cancel(@Path("id") id: String, @Body input: EmptyInput = EmptyInput()): Response<ApiData<Ticket>>
    @GET("me/vaccinations") suspend fun vaccinations(@Query("page") page: Int = 1, @Query("page_size") pageSize: Int = 20): Response<ApiPage<Vaccination>>
    @GET("me/pending-vaccinations") suspend fun pendingVaccinations(@Query("page") page: Int = 1, @Query("page_size") pageSize: Int = 20): Response<ApiPage<PendingVaccination>>
    @GET("me/visits") suspend fun visits(@Query("page") page: Int = 1, @Query("page_size") pageSize: Int = 20): Response<ApiPage<Visit>>
}

// tokenProvider must be thread-safe and non-blocking. Keep the token in memory
// initially; persistent storage belongs to the Android app's secure storage layer.
fun createPatientApi(tokenProvider: () -> String?): UbsPatientApi {
    val baseUrl = "https://sistema-gerenciamento-ubs.vercel.app/api/v1/"
    val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    val client = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .addInterceptor { chain ->
            val request = chain.request()
            val builder = request.newBuilder()
            val publicRoute = request.url.encodedPath.endsWith("/auth/login") || request.url.encodedPath.endsWith("/auth/register")
            if (!publicRoute && request.url.host == "sistema-gerenciamento-ubs.vercel.app") {
                tokenProvider()?.let { builder.header("Authorization", "Bearer $it") }
            }
            chain.proceed(builder.build())
        }
        .build()
    return Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(UbsPatientApi::class.java)
}
